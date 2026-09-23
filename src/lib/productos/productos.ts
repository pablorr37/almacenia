import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import type { Usuario } from "@/lib/auth/auth";
import type { Producto as ProductoDb } from "@/generated-prisma/client";

const PAGE_SIZE_DEFAULT = 20;
const PAGE_SIZE_MAXIMO = 100;

export interface Producto {
  id: string;
  tiendaId: string;
  nombre: string;
  descripcion: string | null;
  precio: number;
  stock: number;
  disponible: boolean;
}

function aProducto(producto: ProductoDb): Producto {
  return {
    id: producto.id,
    tiendaId: producto.tiendaId,
    nombre: producto.nombre,
    descripcion: producto.descripcion,
    precio: Number(producto.precio),
    stock: producto.stock,
    disponible: producto.disponible,
  };
}

export function esComprable(producto: Producto): boolean {
  return producto.disponible && producto.stock > 0;
}

async function verificarPropiedad(vendedor: Usuario, tiendaId: string): Promise<void> {
  const tienda = await prisma.tienda.findUnique({ where: { id: tiendaId } });
  if (!tienda) {
    throw new AppError("TIENDA_NO_ENCONTRADA", "La tienda no existe.");
  }
  if (tienda.vendedorId !== vendedor.id) {
    throw new AppError("NO_ES_DUENO_DE_TIENDA", "No sos el dueño de esta tienda.");
  }
}

function validarPrecio(precio: number): void {
  if (typeof precio !== "number" || Number.isNaN(precio) || precio < 0) {
    throw new AppError("PRECIO_INVALIDO", "El precio no puede ser negativo.");
  }
}

function validarStock(stock: number): void {
  if (typeof stock !== "number" || Number.isNaN(stock) || stock < 0) {
    throw new AppError("STOCK_INVALIDO", "El stock no puede ser negativo.");
  }
}

export interface CrearProductoInput {
  nombre: string;
  descripcion?: string;
  precio: number;
  stock: number;
}

export async function crearProducto(
  vendedor: Usuario,
  tiendaId: string,
  input: CrearProductoInput
): Promise<Producto> {
  await verificarPropiedad(vendedor, tiendaId);
  validarPrecio(input.precio);
  validarStock(input.stock);

  const producto = await prisma.producto.create({
    data: {
      tiendaId,
      nombre: input.nombre,
      descripcion: input.descripcion ?? null,
      precio: input.precio,
      stock: input.stock,
    },
  });

  return aProducto(producto);
}

export interface ListarProductosInput {
  tiendaId: string;
  soloDisponibles?: boolean;
  page?: number;
  pageSize?: number;
}

export async function listarProductos(
  input: ListarProductosInput
): Promise<{ data: Producto[]; page: number; pageSize: number; total: number }> {
  const page = input.page && input.page > 0 ? input.page : 1;
  const pageSize = input.pageSize && input.pageSize > 0
    ? Math.min(input.pageSize, PAGE_SIZE_MAXIMO)
    : PAGE_SIZE_DEFAULT;

  const where = {
    tiendaId: input.tiendaId,
    ...(input.soloDisponibles ? { disponible: true, stock: { gt: 0 } } : {}),
  };

  const [productos, total] = await Promise.all([
    prisma.producto.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { creadoEn: "desc" },
    }),
    prisma.producto.count({ where }),
  ]);

  return { data: productos.map(aProducto), page, pageSize, total };
}

export interface ActualizarProductoInput {
  nombre?: string;
  descripcion?: string;
  precio?: number;
  stock?: number;
  disponible?: boolean;
}

async function obtenerProductoConTienda(productoId: string) {
  const producto = await prisma.producto.findUnique({
    where: { id: productoId },
    include: { tienda: true },
  });
  if (!producto) {
    throw new AppError("PRODUCTO_NO_ENCONTRADO", "El producto no existe.");
  }
  return producto;
}

export async function actualizarProducto(
  vendedor: Usuario,
  productoId: string,
  input: ActualizarProductoInput
): Promise<Producto> {
  const actual = await obtenerProductoConTienda(productoId);
  if (actual.tienda.vendedorId !== vendedor.id) {
    throw new AppError("NO_ES_DUENO_DE_TIENDA", "No sos el dueño de esta tienda.");
  }

  if (input.precio !== undefined) validarPrecio(input.precio);
  if (input.stock !== undefined) validarStock(input.stock);

  const producto = await prisma.producto.update({
    where: { id: productoId },
    data: {
      nombre: input.nombre,
      descripcion: input.descripcion,
      precio: input.precio,
      stock: input.stock,
      disponible: input.disponible,
    },
  });

  return aProducto(producto);
}

export async function eliminarProducto(vendedor: Usuario, productoId: string): Promise<Producto> {
  const actual = await obtenerProductoConTienda(productoId);
  if (actual.tienda.vendedorId !== vendedor.id) {
    throw new AppError("NO_ES_DUENO_DE_TIENDA", "No sos el dueño de esta tienda.");
  }

  const producto = await prisma.producto.update({
    where: { id: productoId },
    data: { disponible: false, stock: 0 },
  });

  return aProducto(producto);
}

// Usada internamente por el módulo `ventas` (05-ventas.md) para debitar stock de
// forma atómica. No se expone como endpoint propio.
export async function debitarStock(productoId: string, cantidad: number): Promise<Producto> {
  const producto = await prisma.producto.findUnique({ where: { id: productoId } });
  if (!producto) {
    throw new AppError("PRODUCTO_NO_ENCONTRADO", "El producto no existe.");
  }
  if (producto.stock < cantidad) {
    throw new AppError("STOCK_INSUFICIENTE", "No hay stock suficiente para debitar.");
  }

  const actualizado = await prisma.producto.update({
    where: { id: productoId },
    data: { stock: { decrement: cantidad } },
  });

  return aProducto(actualizado);
}
