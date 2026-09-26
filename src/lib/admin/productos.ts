import { prisma } from "@/lib/prisma";
import { requireAdmin, type Usuario } from "@/lib/auth/auth";
import { imagenEfectiva, type Producto } from "@/lib/productos/productos";
import type { Categoria } from "@/generated-prisma/client";

const PAGE_SIZE_DEFAULT = 20;
const PAGE_SIZE_MAXIMO = 100;

export interface ProductoAdmin extends Producto {
  tiendaNombre: string;
  vendedorNombre: string;
}

export interface ListarProductosAdminInput {
  tiendaId?: string;
  categoria?: Categoria;
  q?: string;
  page?: number;
  pageSize?: number;
}

export async function listarProductosAdmin(
  admin: Usuario,
  input: ListarProductosAdminInput
): Promise<{ data: ProductoAdmin[]; page: number; pageSize: number; total: number }> {
  requireAdmin(admin);

  const page = input.page && input.page > 0 ? input.page : 1;
  const pageSize = input.pageSize && input.pageSize > 0
    ? Math.min(input.pageSize, PAGE_SIZE_MAXIMO)
    : PAGE_SIZE_DEFAULT;

  const where = {
    ...(input.tiendaId ? { tiendaId: input.tiendaId } : {}),
    ...(input.categoria ? { categoria: input.categoria } : {}),
    ...(input.q
      ? { OR: [{ nombre: { contains: input.q, mode: "insensitive" as const } }, { descripcion: { contains: input.q, mode: "insensitive" as const } }] }
      : {}),
  };

  const [productos, total] = await Promise.all([
    prisma.producto.findMany({
      where,
      include: {
        tienda: { select: { nombre: true, plan: true, vendedor: { select: { nombre: true } } } },
        catalogo: { select: { imagenUrl: true } },
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { creadoEn: "desc" },
    }),
    prisma.producto.count({ where }),
  ]);

  const data = productos.map((p) => ({
    id: p.id,
    tiendaId: p.tiendaId,
    catalogoId: p.catalogoId,
    nombre: p.nombre,
    descripcion: p.descripcion,
    categoria: p.categoria,
    imagenUrl: p.imagenUrl,
    imagenCatalogoUrl: p.catalogo.imagenUrl,
    imagenEfectiva: imagenEfectiva(p.tienda, p, p.catalogo),
    precio: Number(p.precio),
    precioOferta: p.precioOferta === null ? null : Number(p.precioOferta),
    destacado: p.destacado,
    stock: p.stock,
    disponible: p.disponible,
    tiendaNombre: p.tienda.nombre,
    vendedorNombre: p.tienda.vendedor.nombre,
  }));

  return { data, page, pageSize, total };
}
