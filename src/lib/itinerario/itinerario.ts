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
  type DiagnosticoItem,
  type MotivoFaltante,
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
  motivos: Record<string, MotivoFaltante>;
}

// Hasta dónde se busca "la tienda más cercana fuera del radio" (15-itinerario.md §7).
const RADIO_DIAGNOSTICO_KM = 50;

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
  const todasEnRadio: TiendaCandidata[] = cercanas.map((t) => ({
      id: t.id,
      nombre: t.nombre,
      direccion: t.direccion,
      lat: t.lat,
      lon: t.lon,
      distanciaKm: t.distanciaKm,
      verificada: t.verificada,
      estadoApertura: estadoApertura(t.horarios, ahora, { abierto24hs: t.abierto24hs }),
    }));
  const tiendas = todasEnRadio.filter((t) => !input.soloAbiertas || t.estadoApertura.estado === "abierta");

  const catalogo = await prisma.productoCatalogo.findMany({
    where: { id: { in: items.map((i) => i.catalogoId) } },
    select: { id: true, nombre: true, marca: true },
  });
  if (catalogo.length !== items.length) {
    throw new AppError("CATALOGO_NO_ENCONTRADO", "Algún producto de la lista no existe en el catálogo.");
  }
  const nombrePorId = new Map(catalogo.map((c) => [c.id, c.marca ? `${c.nombre} (${c.marca})` : c.nombre]));
  const cantidadPorId = new Map(items.map((i) => [i.catalogoId, i.cantidad]));

  // Se traen los productos de TODAS las tiendas del radio (también cerradas) para
  // poder explicar faltantes; las ofertas usan solo las tiendas filtradas.
  const productosEnRadio =
    todasEnRadio.length === 0
      ? []
      : await prisma.producto.findMany({
          where: {
            tiendaId: { in: todasEnRadio.map((t) => t.id) },
            catalogoId: { in: items.map((i) => i.catalogoId) },
            disponible: true,
          },
          select: { id: true, tiendaId: true, catalogoId: true, precio: true, precioOferta: true, stock: true },
        }).then((ps) => ps.map((p) => ({ ...p, stock: Number(p.stock) })));
  const idsFiltradas = new Set(tiendas.map((t) => t.id));
  const productos = productosEnRadio.filter((p) => idsFiltradas.has(p.tiendaId));
  // Fase 1: una tienda con stock parcial no cuenta como oferta del ítem.
  const ofertas: Oferta[] = productos
    .filter((p) => p.stock >= (cantidadPorId.get(p.catalogoId) ?? Infinity))
    .map((p) => ({
      tiendaId: p.tiendaId,
      catalogoId: p.catalogoId,
      productoId: p.id,
      precioUnitario: Number(p.precioOferta ?? p.precio),
    }));

  const diagnosticos = await diagnosticar(items, todasEnRadio, productosEnRadio, input);

  const resultado = armarPlanes({
    origen: { lat: input.lat, lon: input.lon },
    items: items.map((i) => ({ ...i, nombre: nombrePorId.get(i.catalogoId)! })),
    tiendas,
    ofertas,
    costoKm: await obtenerConfig("itinerario.costo_km"),
    maxTiendas,
    diagnosticos,
    soloAbiertas: input.soloAbiertas ?? false,
  });

  const conOfertas = new Set(ofertas.map((o) => o.tiendaId));
  return { ...resultado, tiendas: tiendas.filter((t) => conOfertas.has(t.id)) };
}

// Diagnóstico por ítem para explicar faltantes (15-itinerario.md §7): dónde se
// publica dentro del radio (stock, abierta) y, si no hay nada en el radio, a qué
// distancia está la tienda activa más cercana que lo publica (hasta 50 km).
async function diagnosticar(
  items: ItemListaInput[],
  todasEnRadio: TiendaCandidata[],
  productosEnRadio: Array<{ tiendaId: string; catalogoId: string; stock: number }>,
  origen: { lat: number; lon: number }
): Promise<Record<string, DiagnosticoItem>> {
  const tiendaPorId = new Map(todasEnRadio.map((t) => [t.id, t]));
  const diagnosticos: Record<string, DiagnosticoItem> = {};
  for (const item of items) {
    diagnosticos[item.catalogoId] = {
      enRadio: productosEnRadio
        .filter((p) => p.catalogoId === item.catalogoId)
        .map((p) => {
          const t = tiendaPorId.get(p.tiendaId)!;
          return { tiendaId: t.id, tiendaNombre: t.nombre, stock: p.stock, abierta: t.estadoApertura.estado === "abierta" };
        }),
      masCercanaFueraKm: null,
    };
  }

  const sinNadaEnRadio = items.filter((i) => diagnosticos[i.catalogoId].enRadio.length === 0).map((i) => i.catalogoId);
  if (sinNadaEnRadio.length > 0) {
    const filas = await prisma.$queryRaw<Array<{ catalogo_id: string; km: number }>>`
      SELECT p.catalogo_id,
        MIN(ST_Distance(t.ubicacion, ST_SetSRID(ST_MakePoint(${origen.lon}, ${origen.lat}), 4326)::geography)) / 1000 AS km
      FROM productos p
      JOIN tiendas t ON t.id = p.tienda_id
      WHERE t.activa = true
        AND p.disponible = true
        AND p.catalogo_id = ANY(${sinNadaEnRadio})
        AND ST_DWithin(t.ubicacion, ST_SetSRID(ST_MakePoint(${origen.lon}, ${origen.lat}), 4326)::geography, ${RADIO_DIAGNOSTICO_KM * 1000})
      GROUP BY p.catalogo_id
    `;
    for (const f of filas) {
      diagnosticos[f.catalogo_id].masCercanaFueraKm = Math.round(Number(f.km) * 10) / 10;
    }
  }
  return diagnosticos;
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
