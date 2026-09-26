// Gamificación: puntos por acciones de vendedores y compradores
// (specs/sdd/12-gamificacion.md).
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import type { Usuario } from "@/lib/auth/auth";
import { obtenerConfig } from "@/lib/config/config";
import { ZONA_HORARIA_NEGOCIO } from "@/lib/tiendas/horarios";
import type { EventoPuntos as EventoPuntosDb, Prisma } from "@/generated-prisma/client";

const PAGE_SIZE_DEFAULT = 20;
const PAGE_SIZE_MAXIMO = 100;

export interface EventoPuntos {
  id: string;
  usuarioId: string;
  tipo: string;
  puntos: number;
  tiendaId: string | null;
  contraparteUsuarioId: string | null;
  metadata: Record<string, unknown> | null;
  creadoEn: string;
}

export interface RegistrarEventoOpciones {
  tiendaId?: string | null;
  contraparteUsuarioId?: string | null;
  claveUnica?: string;
  metadata?: Record<string, unknown>;
}

export interface MovimientoPuntos {
  id: string;
  tipo: string;
  descripcion: string;
  puntos: number;
  creadoEn: string;
  tienda: { id: string; nombre: string } | null;
  contraparte: { id: string; nombre: string } | null;
}

export interface LineaVenta {
  productoId: string;
  cantidad: number;
}

export interface EstadoVisitaPagina {
  ultimoMes: string; // "YYYY-MM"
  ultimoValor: number;
}

// Texto legible de cada tipo para el historial.
const DESCRIPCION_POR_TIPO: Record<string, string> = {
  producto_cargado: "Cargaste un producto",
  foto_cargada: "Cargaste una foto de producto",
  venta_realizada: "Venta realizada",
  compra_realizada: "Compra realizada",
  visita_compra: "Visitaste la tienda y compraste",
  checkin_gps: "Check-in en la tienda",
  visita_pagina: "Visitaste la página de la tienda",
};

// ---------------------------------------------------------------------------
// Reglas puras
// ---------------------------------------------------------------------------

function redondear1(n: number): number {
  return Math.round(n * 10) / 10;
}

function agruparPorProducto(items: LineaVenta[]): Map<string, number> {
  const porProducto = new Map<string, number>();
  for (const item of items) {
    porProducto.set(item.productoId, (porProducto.get(item.productoId) ?? 0) + item.cantidad);
  }
  return porProducto;
}

export function productosDistintos(items: LineaVenta[]): number {
  return agruparPorProducto(items).size;
}

// venta_realizada: 1 + 0,1·productos distintos + 0,1·unidades de las líneas con más de 3.
export function puntosVentaVendedor(items: LineaVenta[]): number {
  const porProducto = agruparPorProducto(items);
  const unidadesGrandes = [...porProducto.values()].filter((c) => c > 3).reduce((s, c) => s + c, 0);
  return redondear1(1 + 0.1 * porProducto.size + 0.1 * unidadesGrandes);
}

// compra_realizada: ≥2 productos distintos o alguna línea con más de 5 unidades.
export function compraPuntua(items: LineaVenta[]): boolean {
  const porProducto = agruparPorProducto(items);
  return porProducto.size >= 2 || [...porProducto.values()].some((c) => c > 5);
}

function indiceMes(mes: string): number {
  const [anio, m] = mes.split("-").map(Number);
  return anio * 12 + (m - 1);
}

// visita_pagina: 5 la primera vez; mes consecutivo −0,5 (piso 0,5); por cada mes
// sin entrar, +0,5 (tope 5); 0 si ya puntuó ese mes.
export function puntosVisitaPagina(previo: EstadoVisitaPagina | null, mesActual: string): number {
  if (!previo) return 5;
  const k = indiceMes(mesActual) - indiceMes(previo.ultimoMes);
  if (k <= 0) return 0;
  if (k === 1) return Math.max(0.5, redondear1(previo.ultimoValor - 0.5));
  return Math.min(5, redondear1(previo.ultimoValor + 0.5 * (k - 1)));
}

function partesLocales(fecha: Date): { anio: string; mes: string; dia: string } {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA_HORARIA_NEGOCIO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(fecha);
  const valor = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "";
  return { anio: valor("year"), mes: valor("month"), dia: valor("day") };
}

export function diaLocal(fecha: Date): string {
  const { anio, mes, dia } = partesLocales(fecha);
  return `${anio}-${mes}-${dia}`;
}

export function mesLocal(fecha: Date): string {
  const { anio, mes } = partesLocales(fecha);
  return `${anio}-${mes}`;
}

// Rango [inicio, fin) en UTC del día local `dia` ("YYYY-MM-DD"). San Juan es UTC-3
// todo el año (sin horario de verano), por eso el offset fijo.
function rangoDiaLocal(dia: string): { inicio: Date; fin: Date } {
  const inicio = new Date(`${dia}T00:00:00-03:00`);
  return { inicio, fin: new Date(inicio.getTime() + 24 * 60 * 60 * 1000) };
}

// ---------------------------------------------------------------------------
// Persistencia
// ---------------------------------------------------------------------------

function aEventoPuntos(evento: EventoPuntosDb): EventoPuntos {
  return {
    id: evento.id,
    usuarioId: evento.usuarioId,
    tipo: evento.tipo,
    puntos: Number(evento.puntos),
    tiendaId: evento.tiendaId,
    contraparteUsuarioId: evento.contraparteUsuarioId,
    metadata: (evento.metadata as Record<string, unknown> | null) ?? null,
    creadoEn: evento.creadoEn.toISOString(),
  };
}

// Con una claveUnica ya usada no inserta nada y devuelve null (ON CONFLICT DO
// NOTHING vía skipDuplicates, así es seguro también dentro de una transacción).
export async function registrarEvento(
  usuarioId: string,
  tipo: string,
  puntos: number,
  opciones: RegistrarEventoOpciones = {}
): Promise<EventoPuntos | null> {
  const data = {
    usuarioId,
    tipo,
    puntos,
    tiendaId: opciones.tiendaId ?? null,
    contraparteUsuarioId: opciones.contraparteUsuarioId ?? null,
    metadata: (opciones.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
  };

  if (!opciones.claveUnica) {
    return aEventoPuntos(await prisma.eventoPuntos.create({ data }));
  }

  const { count } = await prisma.eventoPuntos.createMany({
    data: [{ ...data, claveUnica: opciones.claveUnica }],
    skipDuplicates: true,
  });
  if (count === 0) return null;
  const evento = await prisma.eventoPuntos.findUniqueOrThrow({ where: { claveUnica: opciones.claveUnica } });
  return aEventoPuntos(evento);
}

export async function totalPuntos(usuarioId: string): Promise<number> {
  const resultado = await prisma.eventoPuntos.aggregate({
    where: { usuarioId },
    _sum: { puntos: true },
  });
  return Number(resultado._sum.puntos ?? 0);
}

export async function historialPuntos(
  usuario: Usuario,
  paginacion: { page?: number; pageSize?: number }
): Promise<{ data: MovimientoPuntos[]; page: number; pageSize: number; total: number }> {
  const page = paginacion.page && paginacion.page > 0 ? paginacion.page : 1;
  const pageSize =
    paginacion.pageSize && paginacion.pageSize > 0 ? Math.min(paginacion.pageSize, PAGE_SIZE_MAXIMO) : PAGE_SIZE_DEFAULT;

  const [eventos, total] = await Promise.all([
    prisma.eventoPuntos.findMany({
      where: { usuarioId: usuario.id },
      include: { tienda: { select: { id: true, nombre: true } }, contraparte: { select: { id: true, nombre: true } } },
      orderBy: { creadoEn: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.eventoPuntos.count({ where: { usuarioId: usuario.id } }),
  ]);

  return {
    data: eventos.map((e) => ({
      id: e.id,
      tipo: e.tipo,
      descripcion: DESCRIPCION_POR_TIPO[e.tipo] ?? e.tipo,
      puntos: Number(e.puntos),
      creadoEn: e.creadoEn.toISOString(),
      tienda: e.tienda,
      contraparte: e.contraparte,
    })),
    page,
    pageSize,
    total,
  };
}

// Otorgar puntos nunca debe romper la operación de negocio que lo dispara
// (12-gamificacion.md, "Robustez"): se loguea y se sigue.
export async function sinRomper(fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch (error) {
    console.error("[gamificacion] no se pudieron otorgar puntos:", error);
  }
}

// ---------------------------------------------------------------------------
// Disparadores
// ---------------------------------------------------------------------------

export async function otorgarPorProductoCargado(vendedorId: string, tiendaId: string, catalogoId: string): Promise<void> {
  await registrarEvento(vendedorId, "producto_cargado", 1, {
    tiendaId,
    claveUnica: `producto_cargado:${tiendaId}:${catalogoId}`,
    metadata: { catalogoId },
  });
}

export async function otorgarPorFotoCargada(vendedorId: string, tiendaId: string, catalogoId: string): Promise<void> {
  await registrarEvento(vendedorId, "foto_cargada", 1, {
    tiendaId,
    claveUnica: `foto_cargada:${tiendaId}:${catalogoId}`,
    metadata: { catalogoId },
  });
}

// visita_compra de las ventas del comprador en la tienda en el día local de
// `fecha`, si hay check-in ese día. Devuelve los puntos otorgados.
async function acreditarVisitasCompra(compradorId: string, tiendaId: string, fecha: Date): Promise<number> {
  const { inicio, fin } = rangoDiaLocal(diaLocal(fecha));
  const checkIn = await prisma.checkInTienda.findFirst({
    where: { compradorId, tiendaId, creadoEn: { gte: inicio, lt: fin } },
  });
  if (!checkIn) return 0;

  const ventas = await prisma.venta.findMany({
    where: { compradorId, tiendaId, creadaEn: { gte: inicio, lt: fin } },
    include: { items: true },
    orderBy: { creadaEn: "asc" },
  });
  if (ventas.length === 0) return 0;

  const umbral = await obtenerConfig("gamificacion.umbral_items_compra_extra");
  let otorgados = 0;
  for (const [i, venta] of ventas.entries()) {
    const elegible = i === 0 || productosDistintos(venta.items) > umbral;
    if (!elegible) continue;
    const evento = await registrarEvento(compradorId, "visita_compra", 1, {
      tiendaId,
      claveUnica: `visita_compra:${venta.id}`,
      metadata: { ventaId: venta.id },
    });
    if (evento) otorgados += evento.puntos;
  }
  return otorgados;
}

export async function otorgarPorVenta(ventaId: string): Promise<void> {
  const venta = await prisma.venta.findUnique({
    where: { id: ventaId },
    include: { items: true, tienda: { select: { id: true, vendedorId: true } } },
  });
  if (!venta) return;

  await registrarEvento(venta.tienda.vendedorId, "venta_realizada", puntosVentaVendedor(venta.items), {
    tiendaId: venta.tiendaId,
    contraparteUsuarioId: venta.compradorId,
    claveUnica: `venta_realizada:${venta.id}`,
    metadata: { ventaId: venta.id },
  });

  const compradorId = venta.compradorId;
  if (!compradorId || compradorId === venta.tienda.vendedorId) return;

  if (compraPuntua(venta.items)) {
    await registrarEvento(compradorId, "compra_realizada", 1, {
      tiendaId: venta.tiendaId,
      claveUnica: `compra_realizada:${venta.id}`,
      metadata: { ventaId: venta.id },
    });
  }
  await acreditarVisitasCompra(compradorId, venta.tiendaId, venta.creadaEn);
}

// checkin_gps (1 por día y tienda) + visita_compra retroactiva del día.
export async function otorgarPorCheckIn(compradorId: string, tiendaId: string, fecha: Date): Promise<number> {
  const evento = await registrarEvento(compradorId, "checkin_gps", 1, {
    tiendaId,
    claveUnica: `checkin_gps:${compradorId}:${tiendaId}:${diaLocal(fecha)}`,
  });
  const visitas = await acreditarVisitasCompra(compradorId, tiendaId, fecha);
  return (evento?.puntos ?? 0) + visitas;
}

export async function registrarVisitaPagina(usuario: Usuario, tiendaId: string, ahora = new Date()): Promise<number> {
  const tienda = await prisma.tienda.findUnique({ where: { id: tiendaId }, select: { vendedorId: true } });
  if (!tienda) {
    throw new AppError("TIENDA_NO_ENCONTRADA", "La tienda no existe.");
  }
  if (tienda.vendedorId === usuario.id) return 0;

  const mes = mesLocal(ahora);
  const clave = { compradorId: usuario.id, tiendaId };
  const previo = await prisma.visitaPaginaTienda.findUnique({ where: { compradorId_tiendaId: clave } });
  const puntos = puntosVisitaPagina(
    previo ? { ultimoMes: previo.ultimoMes, ultimoValor: Number(previo.ultimoValor) } : null,
    mes
  );
  if (puntos === 0) return 0;

  const evento = await registrarEvento(usuario.id, "visita_pagina", puntos, {
    tiendaId,
    claveUnica: `visita_pagina:${usuario.id}:${tiendaId}:${mes}`,
  });
  if (!evento) return 0; // otra request del mismo mes ganó la carrera
  await prisma.visitaPaginaTienda.upsert({
    where: { compradorId_tiendaId: clave },
    create: { ...clave, ultimoMes: mes, ultimoValor: puntos },
    update: { ultimoMes: mes, ultimoValor: puntos },
  });
  return puntos;
}
