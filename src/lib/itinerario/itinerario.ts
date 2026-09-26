// "Buscar y comparar" (specs/sdd/15-itinerario.md), fase 1: reúne tiendas en
// radio (PostGIS), ofertas y configuración, y delega el cálculo en planes.ts.
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import type { Usuario } from "@/lib/auth/auth";
import { buscarTiendasCercanas } from "@/lib/tiendas/tiendas";
import { estadoApertura } from "@/lib/tiendas/horarios";
import { obtenerConfig } from "@/lib/config/config";
import { normalizarItems, obtenerLista, type ItemListaInput } from "@/lib/listas/listas";
import {
  armarPlanes,
  MAX_TIENDAS_POR_PLAN,
  type FilaComparativa,
  type Oferta,
  type PlanCompra,
  type TiendaCandidata,
} from "./planes";

export interface CompararInput {
  items: ItemListaInput[];
  lat: number;
  lon: number;
  radioKm?: number;
  soloAbiertas?: boolean;
  maxTiendas?: number;
}

export interface ResultadoComparacion {
  tiendas: TiendaCandidata[];
  comparativa: FilaComparativa[];
  planes: PlanCompra[];
  sinOfertas: string[];
}

export async function compararItems(input: CompararInput, ahora = new Date()): Promise<ResultadoComparacion> {
  const items = normalizarItems(input.items);
  if (items.length === 0) {
    throw new AppError("ITEMS_LISTA_INVALIDOS", "La lista tiene que tener al menos un producto para comparar.");
  }
  const maxTiendas = input.maxTiendas ?? MAX_TIENDAS_POR_PLAN;
  if (!Number.isInteger(maxTiendas) || maxTiendas < 1 || maxTiendas > MAX_TIENDAS_POR_PLAN) {
    throw new AppError("MAX_TIENDAS_INVALIDO", `maxTiendas debe ser un entero entre 1 y ${MAX_TIENDAS_POR_PLAN}.`);
  }

  // Valida ubicación y radio (UBICACION_INVALIDA / RADIO_INVALIDO).
  const cercanas = await buscarTiendasCercanas({ lat: input.lat, lon: input.lon, radioKm: input.radioKm });
  const tiendas: TiendaCandidata[] = cercanas
    .map((t) => ({
      id: t.id,
      nombre: t.nombre,
      direccion: t.direccion,
      lat: t.lat,
      lon: t.lon,
      distanciaKm: t.distanciaKm,
      verificada: t.verificada,
      estadoApertura: estadoApertura(t.horarios, ahora),
    }))
    .filter((t) => !input.soloAbiertas || t.estadoApertura.estado === "abierta");

  const catalogo = await prisma.productoCatalogo.findMany({
    where: { id: { in: items.map((i) => i.catalogoId) } },
    select: { id: true, nombre: true, marca: true },
  });
  if (catalogo.length !== items.length) {
    throw new AppError("CATALOGO_NO_ENCONTRADO", "Algún producto de la lista no existe en el catálogo.");
  }
  const nombrePorId = new Map(catalogo.map((c) => [c.id, c.marca ? `${c.nombre} (${c.marca})` : c.nombre]));
  const cantidadPorId = new Map(items.map((i) => [i.catalogoId, i.cantidad]));

  const productos =
    tiendas.length === 0
      ? []
      : await prisma.producto.findMany({
          where: {
            tiendaId: { in: tiendas.map((t) => t.id) },
            catalogoId: { in: items.map((i) => i.catalogoId) },
            disponible: true,
          },
          select: { id: true, tiendaId: true, catalogoId: true, precio: true, precioOferta: true, stock: true },
        });
  // Fase 1: una tienda con stock parcial no cuenta como oferta del ítem.
  const ofertas: Oferta[] = productos
    .filter((p) => p.stock >= (cantidadPorId.get(p.catalogoId) ?? Infinity))
    .map((p) => ({
      tiendaId: p.tiendaId,
      catalogoId: p.catalogoId,
      productoId: p.id,
      precioUnitario: Number(p.precioOferta ?? p.precio),
    }));

  const resultado = armarPlanes({
    origen: { lat: input.lat, lon: input.lon },
    items: items.map((i) => ({ ...i, nombre: nombrePorId.get(i.catalogoId)! })),
    tiendas,
    ofertas,
    costoKm: await obtenerConfig("itinerario.costo_km"),
    maxTiendas,
  });

  const conOfertas = new Set(ofertas.map((o) => o.tiendaId));
  return { ...resultado, tiendas: tiendas.filter((t) => conOfertas.has(t.id)) };
}

export async function compararLista(
  comprador: Usuario,
  listaId: string,
  opciones: Omit<CompararInput, "items">
): Promise<ResultadoComparacion> {
  const lista = await obtenerLista(comprador, listaId);
  return compararItems({
    ...opciones,
    items: lista.items.map((i) => ({ catalogoId: i.catalogoId, cantidad: i.cantidad })),
  });
}
