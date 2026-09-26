// Algoritmo puro de "Buscar y comparar", fase 1: precio + distancia en línea recta
// (specs/sdd/15-itinerario.md). Sin DB: lo alimenta itinerario.ts.
import type { EstadoApertura } from "@/lib/tiendas/horarios";

export const MAX_CANDIDATAS = 15;
export const MAX_TIENDAS_POR_PLAN = 3;

export type TipoPlan = "una_tienda" | "mas_barato" | "equilibrado";

export interface Punto {
  lat: number;
  lon: number;
}

export interface TiendaCandidata extends Punto {
  id: string;
  nombre: string;
  direccion: string;
  distanciaKm: number;
  verificada: boolean;
  estadoApertura: EstadoApertura;
}

export interface Oferta {
  tiendaId: string;
  catalogoId: string;
  productoId: string;
  precioUnitario: number;
}

export interface ItemPlan {
  catalogoId: string;
  productoId: string;
  nombre: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
}

export interface ParadaPlan {
  orden: number;
  tienda: TiendaCandidata;
  items: ItemPlan[];
  subtotal: number;
}

export interface PlanCompra {
  etiquetas: TipoPlan[];
  paradas: ParadaPlan[];
  faltantes: Array<{ catalogoId: string; nombre: string; cantidad: number }>;
  subtotal: number;
  distanciaKm: number;
  costoDistancia: number;
  costoTotal: number;
  ahorroVsUnaTienda: number | null;
}

export interface FilaComparativa {
  catalogoId: string;
  nombre: string;
  cantidad: number;
  ofertas: Array<{ tiendaId: string; precioUnitario: number; subtotal: number }>;
}

export interface ItemAComparar {
  catalogoId: string;
  nombre: string;
  cantidad: number;
}

export interface ArmarPlanesInput {
  origen: Punto;
  items: ItemAComparar[];
  tiendas: TiendaCandidata[];
  ofertas: Oferta[];
  costoKm: number;
  maxTiendas: number;
}

const RADIO_TIERRA_KM = 6371;
const aRad = (g: number) => (g * Math.PI) / 180;
const redondear2 = (n: number) => Math.round(n * 100) / 100;

export function distanciaHaversineKm(a: Punto, b: Punto): number {
  const dLat = aRad(b.lat - a.lat);
  const dLon = aRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aRad(a.lat)) * Math.cos(aRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * RADIO_TIERRA_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Vecino más cercano desde el origen, sin volver al origen. Con ≤3 paradas la
// diferencia contra el óptimo exacto es despreciable.
export function ordenarRecorrido(
  origen: Punto,
  paradas: Array<Punto & { id: string }>
): { orden: string[]; distanciaKm: number } {
  const pendientes = [...paradas];
  const orden: string[] = [];
  let actual: Punto = origen;
  let distanciaKm = 0;
  while (pendientes.length > 0) {
    let mejor = 0;
    let mejorDist = Infinity;
    pendientes.forEach((p, i) => {
      const d = distanciaHaversineKm(actual, p);
      if (d < mejorDist) {
        mejorDist = d;
        mejor = i;
      }
    });
    const [siguiente] = pendientes.splice(mejor, 1);
    orden.push(siguiente.id);
    distanciaKm += mejorDist;
    actual = siguiente;
  }
  return { orden, distanciaKm };
}

function combinaciones<T>(elementos: T[], k: number): T[][] {
  if (k === 0) return [[]];
  const resultado: T[][] = [];
  elementos.forEach((e, i) => {
    for (const resto of combinaciones(elementos.slice(i + 1), k - 1)) resultado.push([e, ...resto]);
  });
  return resultado;
}

interface Evaluacion {
  plan: Omit<PlanCompra, "etiquetas" | "ahorroVsUnaTienda">;
  cubiertos: number;
  clave: string;
  tamano: number;
}

export function armarPlanes(input: ArmarPlanesInput): {
  planes: PlanCompra[];
  comparativa: FilaComparativa[];
  sinOfertas: string[];
} {
  const { origen, items, tiendas, costoKm } = input;
  const tiendasPorId = new Map(tiendas.map((t) => [t.id, t]));

  // La mejor oferta de cada tienda para cada producto de catálogo.
  const mejor = new Map<string, Oferta>(); // clave `${tiendaId}|${catalogoId}`
  for (const o of input.ofertas) {
    if (!tiendasPorId.has(o.tiendaId)) continue;
    const clave = `${o.tiendaId}|${o.catalogoId}`;
    const actual = mejor.get(clave);
    if (!actual || o.precioUnitario < actual.precioUnitario) mejor.set(clave, o);
  }
  const ofertaDe = (tiendaId: string, catalogoId: string) => mejor.get(`${tiendaId}|${catalogoId}`);

  const comparativa: FilaComparativa[] = items.map((item) => ({
    catalogoId: item.catalogoId,
    nombre: item.nombre,
    cantidad: item.cantidad,
    ofertas: tiendas
      .map((t) => ofertaDe(t.id, item.catalogoId))
      .filter((o): o is Oferta => Boolean(o))
      .sort((a, b) => a.precioUnitario - b.precioUnitario)
      .map((o) => ({
        tiendaId: o.tiendaId,
        precioUnitario: o.precioUnitario,
        subtotal: redondear2(o.precioUnitario * item.cantidad),
      })),
  }));
  const sinOfertas = comparativa.filter((f) => f.ofertas.length === 0).map((f) => f.catalogoId);

  const cobertura = (t: TiendaCandidata) => items.filter((i) => ofertaDe(t.id, i.catalogoId)).length;
  const candidatas = tiendas
    .filter((t) => cobertura(t) > 0)
    .sort((a, b) => cobertura(b) - cobertura(a) || a.distanciaKm - b.distanciaKm)
    .slice(0, MAX_CANDIDATAS);
  if (candidatas.length === 0) return { planes: [], comparativa, sinOfertas };

  function evaluar(conjunto: TiendaCandidata[]): Evaluacion {
    const itemsPorTienda = new Map<string, ItemPlan[]>();
    const faltantes: PlanCompra["faltantes"] = [];
    for (const item of items) {
      let elegida: { tienda: TiendaCandidata; oferta: Oferta } | null = null;
      for (const t of conjunto) {
        const o = ofertaDe(t.id, item.catalogoId);
        if (!o) continue;
        if (
          !elegida ||
          o.precioUnitario < elegida.oferta.precioUnitario ||
          (o.precioUnitario === elegida.oferta.precioUnitario && t.distanciaKm < elegida.tienda.distanciaKm)
        ) {
          elegida = { tienda: t, oferta: o };
        }
      }
      if (!elegida) {
        faltantes.push({ catalogoId: item.catalogoId, nombre: item.nombre, cantidad: item.cantidad });
        continue;
      }
      const lista = itemsPorTienda.get(elegida.tienda.id) ?? [];
      lista.push({
        catalogoId: item.catalogoId,
        productoId: elegida.oferta.productoId,
        nombre: item.nombre,
        cantidad: item.cantidad,
        precioUnitario: elegida.oferta.precioUnitario,
        subtotal: redondear2(elegida.oferta.precioUnitario * item.cantidad),
      });
      itemsPorTienda.set(elegida.tienda.id, lista);
    }

    const usadas = conjunto.filter((t) => itemsPorTienda.has(t.id));
    const recorrido = ordenarRecorrido(origen, usadas);
    const paradas: ParadaPlan[] = recorrido.orden.map((id, i) => {
      const itemsParada = itemsPorTienda.get(id)!;
      return {
        orden: i + 1,
        tienda: tiendasPorId.get(id)!,
        items: itemsParada,
        subtotal: redondear2(itemsParada.reduce((s, it) => s + it.subtotal, 0)),
      };
    });
    const subtotal = redondear2(paradas.reduce((s, p) => s + p.subtotal, 0));
    const costoDistancia = redondear2(recorrido.distanciaKm * costoKm);
    return {
      plan: {
        paradas,
        faltantes,
        subtotal,
        distanciaKm: redondear2(recorrido.distanciaKm),
        costoDistancia,
        costoTotal: redondear2(subtotal + costoDistancia),
      },
      cubiertos: items.length - faltantes.length,
      clave: recorrido.orden.join(">"),
      tamano: usadas.length,
    };
  }

  const maxTiendas = Math.max(1, Math.min(input.maxTiendas, MAX_TIENDAS_POR_PLAN));
  const evaluaciones: Evaluacion[] = [];
  for (let k = 1; k <= Math.min(maxTiendas, candidatas.length); k++) {
    for (const conjunto of combinaciones(candidatas, k)) evaluaciones.push(evaluar(conjunto));
  }

  const elegir = (lista: Evaluacion[], comparar: (a: Evaluacion, b: Evaluacion) => number) =>
    lista.reduce((mejorEv, ev) => (comparar(ev, mejorEv) < 0 ? ev : mejorEv));

  const porCobertura = (a: Evaluacion, b: Evaluacion) => b.cubiertos - a.cubiertos;
  const unaTienda = elegir(
    evaluaciones.filter((e) => e.tamano === 1),
    (a, b) => porCobertura(a, b) || a.plan.costoTotal - b.plan.costoTotal
  );
  const masBarato = elegir(
    evaluaciones,
    (a, b) => porCobertura(a, b) || a.plan.subtotal - b.plan.subtotal || a.plan.distanciaKm - b.plan.distanciaKm
  );
  const equilibrado = elegir(
    evaluaciones,
    (a, b) => porCobertura(a, b) || a.plan.costoTotal - b.plan.costoTotal || a.plan.distanciaKm - b.plan.distanciaKm
  );

  const planes: PlanCompra[] = [];
  const elegidos: Array<[TipoPlan, Evaluacion]> = [
    ["una_tienda", unaTienda],
    ["mas_barato", masBarato],
    ["equilibrado", equilibrado],
  ];
  const porClave = new Map<string, PlanCompra>();
  for (const [tipo, ev] of elegidos) {
    const existente = porClave.get(ev.clave);
    if (existente) {
      existente.etiquetas.push(tipo);
      continue;
    }
    const plan: PlanCompra = {
      ...ev.plan,
      etiquetas: [tipo],
      ahorroVsUnaTienda:
        ev.cubiertos === unaTienda.cubiertos ? redondear2(unaTienda.plan.subtotal - ev.plan.subtotal) : null,
    };
    porClave.set(ev.clave, plan);
    planes.push(plan);
  }

  return { planes, comparativa, sinOfertas };
}
