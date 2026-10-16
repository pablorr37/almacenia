// Valoración de clientes por el dueño de la tienda (specs/sdd/13-valoraciones-clientes.md).
import { prisma } from "@/lib/prisma";
import { exigirPermiso } from "@/lib/equipo/equipo";
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
  tiendaId?: string; // con varias tiendas (19-equipo-tienda.md); default: la primera propia
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

// Tienda desde la que valora el propietario (19-equipo-tienda.md): la pedida, o la
// primera propia. Valorar clientes es solo del propietario.
async function tiendaDelVendedor(vendedor: Usuario, tiendaId?: string): Promise<{ id: string }> {
  if (tiendaId) {
    await exigirPermiso(vendedor, tiendaId, "propietario");
    return { id: tiendaId };
  }
  const tienda = await prisma.tienda.findFirst({
    where: { vendedorId: vendedor.id },
    select: { id: true },
    orderBy: { creadaEn: "asc" },
  });
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
  const tienda = await tiendaDelVendedor(vendedor, input.tiendaId);
  if (compradorId === vendedor.id) {
    throw new AppError("VALORACION_PROPIA", "No podés valorarte a vos mismo.");
  }
  const comprador = await prisma.usuario.findUnique({ where: { id: compradorId }, select: { id: true } });
  if (!comprador) {
    throw new AppError("USUARIO_NO_ENCONTRADO", "El cliente no existe.");
  }
  const ventas = await prisma.venta.count({ where: { tiendaId: tienda.id, compradorId, estado: { not: "anulada" } } });
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
  // Lo ve cualquiera que gestione una tienda: propietario o parte de un equipo.
  const gestiona = await prisma.tienda.findFirst({
    where: { OR: [{ vendedorId: vendedor.id }, { miembros: { some: { usuarioId: vendedor.id } } }] },
    select: { id: true },
  });
  if (!gestiona) throw new AppError("FORBIDDEN", "Solo quienes gestionan una tienda pueden ver esto.");
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
  compradorId: string,
  tiendaId?: string
): Promise<ResumenCliente & { miValoracion: ValoracionCliente | null }> {
  const tienda = await tiendaDelVendedor(vendedor, tiendaId);
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
