import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import type { Usuario } from "@/lib/auth/auth";
import { crearProductoNuevoEnCatalogo } from "@/lib/catalogo/catalogo";
import { tienePermiso, type Plan } from "@/lib/planes/planes";
import type { Categoria, Producto as ProductoDb } from "@/generated-prisma/client";

const PAGE_SIZE_DEFAULT = 20;
const PAGE_SIZE_MAXIMO = 100;

export interface Producto {
  id: string;
  tiendaId: string;
  catalogoId: string;
  nombre: string;
  descripcion: string | null;
  categoria: Categoria | null;
  imagenUrl: string | null; // foto personalizada de la tienda (premium)
  imagenCatalogoUrl: string | null; // foto compartida del catálogo
  imagenEfectiva: string | null; // la que se muestra (03-productos.md, regla de fotos)
  precio: number;
  precioOferta: number | null;
  destacado: boolean;
  stock: number;
  disponible: boolean;
}

// Regla de fotos (03-productos.md): la foto propia solo se muestra si la tienda es
// premium; si no, la del catálogo compartido.
export function imagenEfectiva(
  tienda: { plan: Plan },
  producto: { imagenUrl: string | null },
  catalogo: { imagenUrl: string | null }
): string | null {
  if (producto.imagenUrl && tienePermiso(tienda, "fotos_personalizadas")) return producto.imagenUrl;
  return catalogo.imagenUrl ?? null;
}

// Relaciones que hacen falta para resolver la imagen efectiva de un Producto.
const INCLUDE_IMAGEN = {
  tienda: { select: { plan: true } },
  catalogo: { select: { imagenUrl: true } },
} as const;

type ProductoConImagen = ProductoDb & {
  tienda: { plan: Plan };
  catalogo: { imagenUrl: string | null };
};

function exigirFotosPremium(tienda: { plan: Plan }): void {
  if (!tienePermiso(tienda, "fotos_personalizadas")) {
    throw new AppError(
      "FOTOS_SOLO_PREMIUM",
      "Las fotos propias de productos son del plan premium. Tu producto usa la foto del catálogo."
    );
  }
}

function aProducto(producto: ProductoConImagen): Producto {
  return {
    id: producto.id,
    tiendaId: producto.tiendaId,
    catalogoId: producto.catalogoId,
    nombre: producto.nombre,
    descripcion: producto.descripcion,
    categoria: producto.categoria,
    imagenUrl: producto.imagenUrl,
    imagenCatalogoUrl: producto.catalogo.imagenUrl,
    imagenEfectiva: imagenEfectiva(producto.tienda, producto, producto.catalogo),
    precio: Number(producto.precio),
    precioOferta: producto.precioOferta === null ? null : Number(producto.precioOferta),
    destacado: producto.destacado,
    stock: producto.stock,
    disponible: producto.disponible,
  };
}

export function esComprable(producto: Pick<Producto, "disponible" | "stock">): boolean {
  return producto.disponible && producto.stock > 0;
}

async function verificarPropiedad(vendedor: Usuario, tiendaId: string): Promise<{ plan: Plan }> {
  const tienda = await prisma.tienda.findUnique({ where: { id: tiendaId } });
  if (!tienda) {
    throw new AppError("TIENDA_NO_ENCONTRADA", "La tienda no existe.");
  }
  if (tienda.vendedorId !== vendedor.id) {
    throw new AppError("NO_ES_DUENO_DE_TIENDA", "No sos el dueño de esta tienda.");
  }
  return tienda;
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

interface CrearProductoDesdeCatalogoInput {
  catalogoId: string;
  precio: number;
  stock: number;
  imagenUrl?: string;
  descripcion?: string;
}

interface CrearProductoNuevoInput {
  nuevo: {
    nombre: string;
    marca?: string;
    codigoBarras?: string;
    categoria?: Categoria;
    imagenUrl?: string;
  };
  precio: number;
  stock: number;
  descripcion?: string;
}

export type CrearProductoInput = CrearProductoDesdeCatalogoInput | CrearProductoNuevoInput;

export async function crearProducto(
  vendedor: Usuario,
  tiendaId: string,
  input: CrearProductoInput
): Promise<Producto> {
  const tienda = await verificarPropiedad(vendedor, tiendaId);
  validarPrecio(input.precio);
  validarStock(input.stock);
  if ("catalogoId" in input ? input.imagenUrl : input.nuevo.imagenUrl) exigirFotosPremium(tienda);

  const catalogo =
    "catalogoId" in input
      ? await (async () => {
          const encontrado = await prisma.productoCatalogo.findUnique({ where: { id: input.catalogoId } });
          if (!encontrado) {
            throw new AppError("CATALOGO_NO_ENCONTRADO", "El producto de catálogo no existe.");
          }
          return encontrado;
        })()
      : await crearProductoNuevoEnCatalogo(input.nuevo).then((p) =>
          prisma.productoCatalogo.findUniqueOrThrow({ where: { id: p.id } })
        );

  const producto = await prisma.producto.create({
    data: {
      tiendaId,
      catalogoId: catalogo.id,
      nombre: catalogo.nombre,
      descripcion: input.descripcion ?? null,
      categoria: catalogo.categoria,
      // La foto del catálogo NO se copia: se resuelve en imagenEfectiva. Esta
      // columna es solo la foto personalizada (premium).
      imagenUrl: "catalogoId" in input ? (input.imagenUrl ?? null) : null,
      precio: input.precio,
      stock: input.stock,
    },
    include: INCLUDE_IMAGEN,
  });

  return aProducto(producto);
}

export type SortProductos = "precio_asc" | "precio_desc" | "alfabetico" | "mas_vendidos" | "rating";
export type TabProductos = "ofertas" | "nuevos" | "destacados";

export interface ListarProductosInput {
  tiendaId: string;
  soloDisponibles?: boolean;
  categoria?: Categoria;
  q?: string;
  precioMin?: number;
  precioMax?: number;
  tab?: TabProductos;
  sort?: SortProductos;
  page?: number;
  pageSize?: number;
}

const ORDEN_POR_SORT: Record<SortProductos, { precio?: "asc" | "desc"; nombre?: "asc" }> = {
  precio_asc: { precio: "asc" },
  precio_desc: { precio: "desc" },
  alfabetico: { nombre: "asc" },
  // mas_vendidos y rating se calculan por agregación (ItemVenta/Resena), no son
  // columnas propias — se resuelven aparte, ver más abajo.
  mas_vendidos: {},
  rating: {},
};

async function ordenarPorAgregacion(
  productoIds: string[],
  sort: "mas_vendidos" | "rating"
): Promise<string[]> {
  if (sort === "mas_vendidos") {
    const agregados = await prisma.itemVenta.groupBy({
      by: ["productoId"],
      where: { productoId: { in: productoIds } },
      _sum: { cantidad: true },
    });
    const cantidadPorId = new Map(agregados.map((a) => [a.productoId, a._sum.cantidad ?? 0]));
    return [...productoIds].sort((a, b) => (cantidadPorId.get(b) ?? 0) - (cantidadPorId.get(a) ?? 0));
  }

  const agregados = await prisma.resena.groupBy({
    by: ["productoId"],
    where: { productoId: { in: productoIds } },
    _avg: { puntuacion: true },
  });
  const ratingPorId = new Map(agregados.map((a) => [a.productoId as string, a._avg.puntuacion ?? 0]));
  return [...productoIds].sort((a, b) => (ratingPorId.get(b) ?? 0) - (ratingPorId.get(a) ?? 0));
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
    ...(input.categoria ? { categoria: input.categoria } : {}),
    ...(input.q ? { OR: [{ nombre: { contains: input.q, mode: "insensitive" as const } }, { descripcion: { contains: input.q, mode: "insensitive" as const } }] } : {}),
    ...(input.precioMin !== undefined || input.precioMax !== undefined
      ? { precio: { ...(input.precioMin !== undefined ? { gte: input.precioMin } : {}), ...(input.precioMax !== undefined ? { lte: input.precioMax } : {}) } }
      : {}),
    ...(input.tab === "ofertas" ? { precioOferta: { not: null } } : {}),
    ...(input.tab === "destacados" ? { destacado: true } : {}),
  };

  const total = await prisma.producto.count({ where });

  // mas_vendidos/rating no son columnas ordenables por Prisma: se trae el universo
  // filtrado completo, se ordena en memoria por la agregación, y recién ahí se
  // pagina — inevitable sin desnormalizar un contador (ver 03-productos.md).
  if (input.sort === "mas_vendidos" || input.sort === "rating") {
    const todos = await prisma.producto.findMany({ where, select: { id: true } });
    const idsOrdenados = await ordenarPorAgregacion(todos.map((p) => p.id), input.sort);
    const idsPagina = idsOrdenados.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize);
    const productos = await prisma.producto.findMany({ where: { id: { in: idsPagina } }, include: INCLUDE_IMAGEN });
    const porId = new Map(productos.map((p) => [p.id, p]));
    const ordenados = idsPagina.map((id) => porId.get(id)!).filter(Boolean);
    return { data: ordenados.map(aProducto), page, pageSize, total };
  }

  const orderBy = input.sort ? ORDEN_POR_SORT[input.sort] : { creadoEn: "desc" as const };
  const productos = await prisma.producto.findMany({
    where,
    skip: (page - 1) * pageSize,
    take: pageSize,
    orderBy: input.tab === "nuevos" ? { creadoEn: "desc" } : orderBy,
    include: INCLUDE_IMAGEN,
  });

  return { data: productos.map(aProducto), page, pageSize, total };
}

export interface ActualizarProductoInput {
  nombre?: string;
  descripcion?: string;
  imagenUrl?: string | null;
  precio?: number;
  precioOferta?: number | null;
  destacado?: boolean;
  stock?: number;
  disponible?: boolean;
}

function validarPrecioOferta(precioOferta: number | null | undefined, precio: number): void {
  if (precioOferta === undefined || precioOferta === null) return;
  if (typeof precioOferta !== "number" || Number.isNaN(precioOferta) || precioOferta < 0 || precioOferta >= precio) {
    throw new AppError("PRECIO_OFERTA_INVALIDO", "El precio de oferta debe ser menor al precio y no negativo.");
  }
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
  const precioFinal = input.precio ?? Number(actual.precio);
  validarPrecioOferta(input.precioOferta, precioFinal);
  if (input.imagenUrl) exigirFotosPremium(actual.tienda);

  const producto = await prisma.producto.update({
    where: { id: productoId },
    data: {
      nombre: input.nombre,
      descripcion: input.descripcion,
      imagenUrl: input.imagenUrl,
      precio: input.precio,
      precioOferta: input.precioOferta,
      destacado: input.destacado,
      stock: input.stock,
      disponible: input.disponible,
    },
    include: INCLUDE_IMAGEN,
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
    include: INCLUDE_IMAGEN,
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
    include: INCLUDE_IMAGEN,
  });

  return aProducto(actualizado);
}
