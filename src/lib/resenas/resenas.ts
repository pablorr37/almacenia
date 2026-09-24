import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import type { Usuario } from "@/lib/auth/auth";
import type { Resena as ResenaDb } from "@/generated-prisma/client";

const PAGE_SIZE_DEFAULT = 20;
const PAGE_SIZE_MAXIMO = 100;

export interface Resena {
  id: string;
  compradorId: string;
  tiendaId: string;
  productoId: string | null;
  puntuacion: number;
  comentario: string | null;
  creadaEn: string;
}

function aResena(r: ResenaDb): Resena {
  return {
    id: r.id,
    compradorId: r.compradorId,
    tiendaId: r.tiendaId,
    productoId: r.productoId,
    puntuacion: r.puntuacion,
    comentario: r.comentario,
    creadaEn: r.creadaEn.toISOString(),
  };
}

function validarPuntuacion(puntuacion: number): void {
  if (!Number.isInteger(puntuacion) || puntuacion < 1 || puntuacion > 5) {
    throw new AppError("PUNTUACION_INVALIDA", "La puntuación debe ser un entero entre 1 y 5.");
  }
}

export interface CrearResenaInput {
  tiendaId: string;
  productoId?: string;
  puntuacion: number;
  comentario?: string;
}

export async function crearResena(comprador: Usuario, input: CrearResenaInput): Promise<Resena> {
  validarPuntuacion(input.puntuacion);

  const tienda = await prisma.tienda.findUnique({ where: { id: input.tiendaId } });
  if (!tienda) {
    throw new AppError("TIENDA_NO_ENCONTRADA", "La tienda no existe.");
  }

  if (input.productoId) {
    const producto = await prisma.producto.findUnique({ where: { id: input.productoId } });
    if (!producto || producto.tiendaId !== input.tiendaId) {
      throw new AppError("PRODUCTO_NO_ENCONTRADO", "El producto no existe en esa tienda.");
    }
  }

  const compraPrevia = await prisma.venta.findFirst({
    where: {
      tiendaId: input.tiendaId,
      compradorId: comprador.id,
      ...(input.productoId ? { items: { some: { productoId: input.productoId } } } : {}),
    },
  });
  if (!compraPrevia) {
    throw new AppError("RESENA_SIN_COMPRA_PREVIA", "Solo se puede reseñar después de haber comprado.");
  }

  const duplicada = await prisma.resena.findFirst({
    where: { compradorId: comprador.id, tiendaId: input.tiendaId, productoId: input.productoId ?? null },
  });
  if (duplicada) {
    throw new AppError("RESENA_DUPLICADA", "Ya reseñaste este producto/tienda.");
  }

  const resena = await prisma.resena.create({
    data: {
      compradorId: comprador.id,
      tiendaId: input.tiendaId,
      productoId: input.productoId ?? null,
      puntuacion: input.puntuacion,
      comentario: input.comentario ?? null,
    },
  });

  return aResena(resena);
}

export interface ListarResenasInput {
  tiendaId: string;
  productoId?: string;
  page?: number;
  pageSize?: number;
}

export async function listarResenas(
  input: ListarResenasInput
): Promise<{ data: Resena[]; page: number; pageSize: number; total: number }> {
  const page = input.page && input.page > 0 ? input.page : 1;
  const pageSize = input.pageSize && input.pageSize > 0
    ? Math.min(input.pageSize, PAGE_SIZE_MAXIMO)
    : PAGE_SIZE_DEFAULT;

  const where = {
    tiendaId: input.tiendaId,
    ...(input.productoId ? { productoId: input.productoId } : {}),
  };

  const [resenas, total] = await Promise.all([
    prisma.resena.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { creadaEn: "desc" },
    }),
    prisma.resena.count({ where }),
  ]);

  return { data: resenas.map(aResena), page, pageSize, total };
}

export async function ratingPromedioProducto(productoId: string): Promise<number | null> {
  const resultado = await prisma.resena.aggregate({
    where: { productoId },
    _avg: { puntuacion: true },
  });
  return resultado._avg.puntuacion;
}
