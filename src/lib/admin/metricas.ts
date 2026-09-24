import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { requireAdmin, type Usuario } from "@/lib/auth/auth";
import type { EstadoPedido } from "@/generated-prisma/client";

const RANGO_DEFAULT_DIAS = 30;

const ESTADOS_PEDIDO: EstadoPedido[] = [
  "pendiente",
  "confirmado",
  "listo_para_retirar",
  "entregado",
  "rechazado",
  "cancelado",
];

export interface RangoFechas {
  desde?: string;
  hasta?: string;
}

export interface Metricas {
  ventas: { cantidad: number; totalFacturado: number };
  pedidos: Record<string, number>;
  tiendasNuevas: number;
  tiendasDadasDeBaja: number;
  usuariosNuevos: number;
}

function resolverRango(rango: RangoFechas): { desde: Date; hasta: Date } {
  const hasta = rango.hasta ? new Date(rango.hasta) : new Date();
  const desde = rango.desde
    ? new Date(rango.desde)
    : new Date(hasta.getTime() - RANGO_DEFAULT_DIAS * 24 * 60 * 60 * 1000);

  if (Number.isNaN(desde.getTime()) || Number.isNaN(hasta.getTime())) {
    throw new AppError("RANGO_INVALIDO", "Las fechas del rango no son válidas.");
  }
  if (desde > hasta) {
    throw new AppError("RANGO_INVALIDO", "'desde' no puede ser posterior a 'hasta'.");
  }

  return { desde, hasta };
}

export async function obtenerMetricas(admin: Usuario, rango: RangoFechas): Promise<Metricas> {
  requireAdmin(admin);
  const { desde, hasta } = resolverRango(rango);
  const entreFechas = { gte: desde, lte: hasta };

  const [ventasAgregado, pedidosAgrupados, tiendasNuevas, tiendasDadasDeBaja, usuariosNuevos] = await Promise.all([
    prisma.venta.aggregate({
      where: { creadaEn: entreFechas },
      _count: { _all: true },
      _sum: { total: true },
    }),
    prisma.pedido.groupBy({
      by: ["estado"],
      where: { creadoEn: entreFechas },
      _count: { _all: true },
    }),
    prisma.tienda.count({ where: { creadaEn: entreFechas } }),
    prisma.tienda.count({ where: { desactivadaEn: entreFechas } }),
    prisma.usuario.count({ where: { creadoEn: entreFechas } }),
  ]);

  const pedidos: Record<string, number> = Object.fromEntries(ESTADOS_PEDIDO.map((e) => [e, 0]));
  for (const grupo of pedidosAgrupados) {
    pedidos[grupo.estado] = grupo._count._all;
  }

  return {
    ventas: {
      cantidad: ventasAgregado._count._all,
      totalFacturado: Number(ventasAgregado._sum.total ?? 0),
    },
    pedidos,
    tiendasNuevas,
    tiendasDadasDeBaja,
    usuariosNuevos,
  };
}
