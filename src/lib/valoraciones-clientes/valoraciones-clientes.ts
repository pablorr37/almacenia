// Valoración de clientes por el dueño de la tienda (specs/sdd/13-valoraciones-clientes.md).
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import type { Usuario } from "@/lib/auth/auth";
import type { ValoracionCliente as ValoracionClienteDb } from "@/generated-prisma/client";

export interface ValoracionCliente {
  id: string;
  tiendaId: string;
  compradorId: string;
  puntuacion: number;
  comentario: string | null;
  creadaEn: string;
  actualizadaEn: string;
}

export interface ValorarClienteInput {
  puntuacion: number;
  comentario?: string;
}

export interface ResumenCliente {
  promedio: number | null;
  cantidad: number;
}

function aValoracion(v: ValoracionClienteDb): ValoracionCliente {
  return {
    id: v.id,
    tiendaId: v.tiendaId,
    compradorId: v.compradorId,
    puntuacion: v.puntuacion,
    comentario: v.comentario,
    creadaEn: v.creadaEn.toISOString(),
    actualizadaEn: v.actualizadaEn.toISOString(),
  };
}

function redondear(promedio: number | null): number | null {
  return promedio === null ? null : Math.round(promedio * 10) / 10;
}

// La tienda del vendedor autenticado. Se resuelve por DB (relación 1:1 del MVP) en
// vez de confiar en el flag esVendedor del objeto en memoria.
async function tiendaDelVendedor(vendedor: Usuario): Promise<{ id: string }> {
  const tienda = await prisma.tienda.findUnique({ where: { vendedorId: vendedor.id }, select: { id: true } });
  if (!tienda) {
    throw new AppError("FORBIDDEN", "Solo los dueños de una tienda pueden valorar clientes.");
  }
  return tienda;
}

export async function valorarCliente(
  vendedor: Usuario,
  compradorId: string,
  input: ValorarClienteInput
): Promise<ValoracionCliente> {
  if (!Number.isInteger(input.puntuacion) || input.puntuacion < 1 || input.puntuacion > 5) {
    throw new AppError("PUNTUACION_INVALIDA", "La puntuación debe ser un entero entre 1 y 5.");
  }
  const tienda = await tiendaDelVendedor(vendedor);
  if (compradorId === vendedor.id) {
    throw new AppError("VALORACION_PROPIA", "No podés valorarte a vos mismo.");
  }
  const comprador = await prisma.usuario.findUnique({ where: { id: compradorId }, select: { id: true } });
  if (!comprador) {
    throw new AppError("USUARIO_NO_ENCONTRADO", "El cliente no existe.");
  }
  const ventas = await prisma.venta.count({ where: { tiendaId: tienda.id, compradorId } });
  if (ventas === 0) {
    throw new AppError("VALORACION_SIN_VENTA_PREVIA", "Solo podés valorar a clientes que te compraron.");
  }

  const comentario = input.comentario?.trim() || null;
  const valoracion = await prisma.valoracionCliente.upsert({
    where: { tiendaId_compradorId: { tiendaId: tienda.id, compradorId } },
    create: { tiendaId: tienda.id, compradorId, puntuacion: input.puntuacion, comentario },
    update: { puntuacion: input.puntuacion, comentario },
  });
  return aValoracion(valoracion);
}

export async function resumenesClientes(
  vendedor: Usuario,
  compradorIds: string[]
): Promise<Record<string, ResumenCliente>> {
  await tiendaDelVendedor(vendedor);
  const ids = [...new Set(compradorIds)];
  const agregados = await prisma.valoracionCliente.groupBy({
    by: ["compradorId"],
    where: { compradorId: { in: ids } },
    _avg: { puntuacion: true },
    _count: { _all: true },
  });
  const porId = new Map(agregados.map((a) => [a.compradorId, a]));
  return Object.fromEntries(
    ids.map((id) => {
      const a = porId.get(id);
      return [id, { promedio: redondear(a?._avg.puntuacion ?? null), cantidad: a?._count._all ?? 0 }];
    })
  );
}

export async function resumenCliente(
  vendedor: Usuario,
  compradorId: string
): Promise<ResumenCliente & { miValoracion: ValoracionCliente | null }> {
  const tienda = await tiendaDelVendedor(vendedor);
  const resumen = (await resumenesClientes(vendedor, [compradorId]))[compradorId];
  const propia = await prisma.valoracionCliente.findUnique({
    where: { tiendaId_compradorId: { tiendaId: tienda.id, compradorId } },
  });
  return { ...resumen, miValoracion: propia ? aValoracion(propia) : null };
}

export async function miResumenComoCliente(comprador: Usuario): Promise<ResumenCliente> {
  const a = await prisma.valoracionCliente.aggregate({
    where: { compradorId: comprador.id },
    _avg: { puntuacion: true },
    _count: { _all: true },
  });
  return { promedio: redondear(a._avg.puntuacion), cantidad: a._count._all };
}
