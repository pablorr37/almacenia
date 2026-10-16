import { prisma } from "@/lib/prisma";
import { requireAdmin, type Usuario } from "@/lib/auth/auth";
import { AppError } from "@/lib/errors";
import { imagenEfectiva, type Producto } from "@/lib/productos/productos";

const PAGE_SIZE_DEFAULT = 20;
const PAGE_SIZE_MAXIMO = 100;

export interface ProductoAdmin extends Producto {
  tiendaNombre: string;
  vendedorNombre: string;
}

export interface ListarProductosAdminInput {
  tiendaId?: string;
  categoriaId?: string;
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
    eliminadoEn: null,
    ...(input.tiendaId ? { tiendaId: input.tiendaId } : {}),
    ...(input.categoriaId ? { categoriaId: input.categoriaId } : {}),
    ...(input.q
      ? { OR: [{ nombre: { contains: input.q, mode: "insensitive" as const } }, { descripcion: { contains: input.q, mode: "insensitive" as const } }] }
      : {}),
  };

  const [productos, total] = await Promise.all([
    prisma.producto.findMany({
      where,
      include: {
        tienda: { select: { nombre: true, plan: true, vendedor: { select: { nombre: true } } } },
        catalogo: { select: { imagenUrl: true, unidad: true } },
        categoria: { select: { id: true, nombre: true } },
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
    favorito: p.favorito,
    imagenUrl: p.imagenUrl,
    imagenCatalogoUrl: p.catalogo.imagenUrl,
    imagenEfectiva: imagenEfectiva(p.tienda, p, p.catalogo),
    precio: Number(p.precio),
    precioOferta: p.precioOferta === null ? null : Number(p.precioOferta),
    destacado: p.destacado,
    stock: Number(p.stock),
    unidad: p.catalogo.unidad,
    disponible: p.disponible,
    tiendaNombre: p.tienda.nombre,
    vendedorNombre: p.tienda.vendedor.nombre,
  }));

  return { data, page, pageSize, total };
}

// Catálogo cargado por compradores desde sus listas (06-catalogo.md): el admin lo
// revisa y borra lo que no corresponde y ninguna tienda vende.
export interface EntradaCatalogoComprador {
  id: string;
  nombre: string;
  marca: string | null;
  creadoEn: string;
  creadoPor: { nombre: string; email: string } | null;
  tiendas: number;
  listas: number;
}

export async function listarCatalogoDeCompradores(
  admin: Usuario,
  input: { page?: number; pageSize?: number }
): Promise<{ data: EntradaCatalogoComprador[]; page: number; pageSize: number; total: number }> {
  requireAdmin(admin);
  const page = input.page && input.page > 0 ? input.page : 1;
  const pageSize = input.pageSize && input.pageSize > 0 ? Math.min(input.pageSize, PAGE_SIZE_MAXIMO) : PAGE_SIZE_DEFAULT;
  const where = { creadoPorId: { not: null } };
  const [entradas, total] = await Promise.all([
    prisma.productoCatalogo.findMany({
      where,
      include: {
        creadoPor: { select: { nombre: true, email: true } },
        _count: { select: { productos: true, itemsListas: true } },
      },
      orderBy: { creadoEn: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.productoCatalogo.count({ where }),
  ]);
  return {
    data: entradas.map((e) => ({
      id: e.id,
      nombre: e.nombre,
      marca: e.marca,
      creadoEn: e.creadoEn.toISOString(),
      creadoPor: e.creadoPor,
      tiendas: e._count.productos,
      listas: e._count.itemsListas,
    })),
    page,
    pageSize,
    total,
  };
}

export async function eliminarEntradaCatalogo(admin: Usuario, catalogoId: string): Promise<{ id: string }> {
  requireAdmin(admin);
  const entrada = await prisma.productoCatalogo.findUnique({
    where: { id: catalogoId },
    include: { _count: { select: { productos: true } } },
  });
  if (!entrada) throw new AppError("CATALOGO_NO_ENCONTRADO", "El producto de catálogo no existe.");
  if (entrada._count.productos > 0) {
    throw new AppError("CATALOGO_EN_USO", "Hay tiendas que venden este producto: no se puede borrar.");
  }
  await prisma.$transaction([
    prisma.itemListaCompras.deleteMany({ where: { catalogoId } }),
    prisma.productoCatalogo.delete({ where: { id: catalogoId } }),
  ]);
  return { id: catalogoId };
}
