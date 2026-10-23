import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { requireAdmin, type Usuario } from "@/lib/auth/auth";
import { obtenerConfig } from "@/lib/config/config";
import { sinRomper } from "@/lib/gamificacion/gamificacion";
import { notificar } from "@/lib/notificaciones/notificar";
import { extenderPremium } from "@/lib/puntos/canjes";
import type { ConceptoPago, EstadoOrdenPago, OrdenPago as OrdenPagoDb, Prisma } from "@/generated-prisma/client";
import { codigoOrden, procesadorActivo } from "./procesador";

// Órdenes de pago en pesos (23-puntos-pagos.md).

const PAGE_SIZE_DEFAULT = 20;
const PAGE_SIZE_MAXIMO = 100;
const ESTADOS: EstadoOrdenPago[] = ["pendiente", "pagada", "cancelada", "vencida"];

export interface OrdenPago {
  id: string;
  codigo: string;
  concepto: ConceptoPago;
  referenciaId: string | null;
  montoArs: number;
  estado: EstadoOrdenPago;
  proveedor: string;
  detalle: Record<string, unknown> | null;
  creadaEn: string;
  pagadaEn: string | null;
}

export interface OrdenPagoAdmin extends OrdenPago {
  usuario: { id: string; nombre: string; email: string };
}

export function aOrdenPago(o: OrdenPagoDb): OrdenPago {
  return {
    id: o.id,
    codigo: codigoOrden(o.id),
    concepto: o.concepto,
    referenciaId: o.referenciaId,
    montoArs: Number(o.montoArs),
    estado: o.estado,
    proveedor: o.proveedor,
    detalle: (o.detalle as Record<string, unknown> | null) ?? null,
    creadaEn: o.creadaEn.toISOString(),
    pagadaEn: o.pagadaEn?.toISOString() ?? null,
  };
}

export async function crearOrdenPago(
  usuarioId: string,
  input: { concepto: ConceptoPago; referenciaId?: string; montoArs: number; detalle?: Record<string, unknown> },
  tx: Prisma.TransactionClient = prisma
): Promise<OrdenPago> {
  const orden = await tx.ordenPago.create({
    data: {
      usuarioId,
      concepto: input.concepto,
      referenciaId: input.referenciaId ?? null,
      montoArs: input.montoArs,
      proveedor: procesadorActivo().nombre,
      detalle: (input.detalle ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
  return aOrdenPago(orden);
}

export async function instruccionesDe(orden: OrdenPago): Promise<{ instrucciones: string; urlPago: string | null }> {
  return procesadorActivo().iniciar({ id: orden.id, montoArs: orden.montoArs, concepto: orden.concepto });
}

export async function crearOrdenPremium(
  usuario: Usuario
): Promise<{ orden: OrdenPago; instrucciones: string; urlPago: string | null }> {
  const u = await prisma.usuario.findUniqueOrThrow({ where: { id: usuario.id }, select: { plan: true, planVenceEn: true } });
  if (u.plan === "plata") throw new AppError("PLAN_YA_SUPERIOR", "Ya tenés el plan plata, que incluye todo lo de premium.");
  if (u.plan === "premium" && !u.planVenceEn) {
    throw new AppError("PLAN_SIN_VENCIMIENTO", "Tu plan premium no vence: no hace falta pagarlo.");
  }
  const pendiente = await prisma.ordenPago.findFirst({ where: { usuarioId: usuario.id, concepto: "premium", estado: "pendiente" } });
  if (pendiente) throw new AppError("ORDEN_PENDIENTE_EXISTE", "Ya tenés una orden de premium pendiente de pago.");
  const orden = await crearOrdenPago(usuario.id, {
    concepto: "premium",
    montoArs: await obtenerConfig("precio.premium_ars"),
    detalle: { dias: await obtenerConfig("canje.premium_dias") },
  });
  return { orden, ...(await instruccionesDe(orden)) };
}

export async function listarMisOrdenes(usuario: Usuario): Promise<OrdenPago[]> {
  const filas = await prisma.ordenPago.findMany({ where: { usuarioId: usuario.id }, orderBy: { creadaEn: "desc" }, take: 50 });
  return filas.map(aOrdenPago);
}

async function buscarPendiente(id: string): Promise<OrdenPagoDb> {
  const orden = await prisma.ordenPago.findUnique({ where: { id } });
  if (!orden) throw new AppError("ORDEN_NO_ENCONTRADA", "La orden de pago no existe.");
  if (orden.estado !== "pendiente") throw new AppError("ORDEN_NO_PENDIENTE", "La orden ya no está pendiente.");
  return orden;
}

export async function cancelarOrden(usuario: Usuario, ordenId: string): Promise<OrdenPago> {
  const orden = await prisma.ordenPago.findUnique({ where: { id: ordenId } });
  if (!orden || (orden.usuarioId !== usuario.id && !usuario.esAdmin)) {
    throw new AppError("ORDEN_NO_ENCONTRADA", "La orden de pago no existe.");
  }
  await buscarPendiente(ordenId);
  const [actualizada] = await prisma.$transaction([
    prisma.ordenPago.update({ where: { id: ordenId }, data: { estado: "cancelada" } }),
    // La campaña que esperaba este pago no sigue (21-publicidad.md).
    prisma.campaniaAviso.updateMany({
      where: { ordenPagoId: ordenId, estado: "pendiente_pago" },
      data: { estado: "finalizada", finalizadaEn: new Date() },
    }),
  ]);
  return aOrdenPago(actualizada);
}

export async function listarOrdenesAdmin(
  admin: Usuario,
  filtros: { estado?: EstadoOrdenPago; page?: number; pageSize?: number }
): Promise<{ data: OrdenPagoAdmin[]; page: number; pageSize: number; total: number }> {
  requireAdmin(admin);
  if (filtros.estado && !ESTADOS.includes(filtros.estado)) {
    throw new AppError("ESTADO_INVALIDO", "Estado de orden inválido.");
  }
  const page = filtros.page && filtros.page > 0 ? filtros.page : 1;
  const pageSize = filtros.pageSize && filtros.pageSize > 0 ? Math.min(filtros.pageSize, PAGE_SIZE_MAXIMO) : PAGE_SIZE_DEFAULT;
  const where = filtros.estado ? { estado: filtros.estado } : {};
  const [filas, total] = await Promise.all([
    prisma.ordenPago.findMany({
      where,
      include: { usuario: { select: { id: true, nombre: true, email: true } } },
      orderBy: { creadaEn: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.ordenPago.count({ where }),
  ]);
  return { data: filas.map((o) => ({ ...aOrdenPago(o), usuario: o.usuario })), page, pageSize, total };
}

// Aplica el beneficio de una orden pagada, en la transacción que la marca pagada.
async function aplicarEnTx(tx: Prisma.TransactionClient, orden: OrdenPagoDb, ahora: Date): Promise<void> {
  if (orden.concepto === "premium") {
    const dias = Number((orden.detalle as { dias?: number } | null)?.dias ?? (await obtenerConfig("canje.premium_dias")));
    await extenderPremium(tx, orden.usuarioId, dias, ahora);
    return;
  }
  if (orden.referenciaId) {
    await tx.campaniaAviso.updateMany({
      where: { id: orden.referenciaId, estado: "pendiente_pago" },
      data: { estado: "en_moderacion" },
    });
  }
}

export async function confirmarOrdenManual(admin: Usuario, ordenId: string, ahora = new Date()): Promise<OrdenPago> {
  requireAdmin(admin);
  await buscarPendiente(ordenId);
  const actualizada = await prisma.$transaction(async (tx) => {
    // Bloqueo + revalidación: dos confirmaciones simultáneas no aplican dos veces.
    const { count } = await tx.ordenPago.updateMany({
      where: { id: ordenId, estado: "pendiente" },
      data: { estado: "pagada", pagadaEn: ahora, confirmadaPor: admin.id },
    });
    if (count === 0) throw new AppError("ORDEN_NO_PENDIENTE", "La orden ya no está pendiente.");
    const orden = await tx.ordenPago.findUniqueOrThrow({ where: { id: ordenId } });
    await aplicarEnTx(tx, orden, ahora);
    return orden;
  });
  await sinRomper(() =>
    notificar([actualizada.usuarioId], {
      tipo: "pago_confirmado",
      titulo: "Recibimos tu pago",
      cuerpo:
        actualizada.concepto === "premium"
          ? "Tu plan premium ya está activo."
          : "Tu campaña de publicidad pasó a revisión y se publica cuando la aprobemos.",
      url: actualizada.concepto === "premium" ? "/perfil/puntos" : "/mi-tienda/publicidad",
    })
  );
  return aOrdenPago(actualizada);
}

// Punto de entrada para los adaptadores con webhook (Mercado Pago, pendiente).
export async function aplicarOrdenPagada(ordenId: string, ahora = new Date()): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.ordenPago.updateMany({
      where: { id: ordenId, estado: "pendiente" },
      data: { estado: "pagada", pagadaEn: ahora },
    });
    if (count === 0) return;
    await aplicarEnTx(tx, await tx.ordenPago.findUniqueOrThrow({ where: { id: ordenId } }), ahora);
  });
}
