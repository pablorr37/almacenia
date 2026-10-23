import { prisma } from "@/lib/prisma";
import { exigirPermiso, PERMISOS, type Permiso } from "@/lib/equipo/equipo";
import { AppError } from "@/lib/errors";
import type { Usuario } from "@/lib/auth/auth";
import { crearProductoNuevoEnCatalogo, conCategoriaDeUsuario, type NuevaEntradaCatalogo } from "@/lib/catalogo/catalogo";
import { tienePermiso, type Plan } from "@/lib/planes/planes";
import { validarCantidad, type UnidadMedida } from "./unidades";
import { ALICUOTAS, calcularPrecio, margenDesde, type AlicuotaIva, type CondicionIva } from "@/lib/precios/precios";
import { sinRomper, otorgarPorProductoCargado, otorgarPorFotoCargada } from "@/lib/gamificacion/gamificacion";
import type { Producto as ProductoDb } from "@/generated-prisma/client";

const PAGE_SIZE_DEFAULT = 20;
const PAGE_SIZE_MAXIMO = 100;

export interface Producto {
  id: string;
  tiendaId: string;
  catalogoId: string;
  nombre: string;
  descripcion: string | null;
  categoria: { id: string; nombre: string } | null; // 17-rubros-categorias.md
  favorito: boolean; // estrella del vendedor en el punto de venta
  imagenUrl: string | null; // foto personalizada de la tienda (premium)
  imagenCatalogoUrl: string | null; // foto compartida del catálogo
  imagenEfectiva: string | null; // la que se muestra (03-productos.md, regla de fotos)
  precio: number;
  precioOferta: number | null;
  destacado: boolean;
  stock: number; // unidades o kg según `unidad`
  unidad: UnidadMedida; // del producto de catálogo (03-productos.md)
  disponible: boolean;
  // 20-precios-facturacion.md. costo y margen solo para quien gestiona la tienda.
  costo: number | null;
  margen: number | null;
  alicuotaIva: AlicuotaIva;
  impuestosInternos: number;
}

// Vistas públicas (comprador): sin costo ni margen.
export function ocultarCostos<T extends { costo: number | null; margen: number | null }>(producto: T): T {
  return { ...producto, costo: null, margen: null };
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
  tienda: { select: { plan: true, condicionIva: true } },
  catalogo: { select: { imagenUrl: true, unidad: true } },
  categoria: { select: { id: true, nombre: true } },
} as const;

type ProductoConImagen = ProductoDb & {
  tienda: { plan: Plan; condicionIva: CondicionIva };
  catalogo: { imagenUrl: string | null; unidad: UnidadMedida };
  categoria: { id: string; nombre: string } | null;
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
    favorito: producto.favorito,
    imagenUrl: producto.imagenUrl,
    imagenCatalogoUrl: producto.catalogo.imagenUrl,
    imagenEfectiva: imagenEfectiva(producto.tienda, producto, producto.catalogo),
    precio: Number(producto.precio),
    precioOferta: producto.precioOferta === null ? null : Number(producto.precioOferta),
    destacado: producto.destacado,
    stock: Number(producto.stock),
    unidad: producto.catalogo.unidad,
    disponible: producto.disponible,
    costo: producto.costo === null ? null : Number(producto.costo),
    margen: producto.margen === null ? null : Number(producto.margen),
    alicuotaIva: producto.alicuotaIva,
    impuestosInternos: Number(producto.impuestosInternos),
  };
}

// Datos de precio que pueden venir al crear o editar (20-precios-facturacion.md).
interface CamposPrecio {
  precio?: number;
  costo?: number | null;
  margen?: number | null;
  alicuotaIva?: AlicuotaIva;
  impuestosInternos?: number;
}

function validarCamposPrecio(input: CamposPrecio): void {
  if (input.precio !== undefined) validarPrecio(input.precio);
  if (input.costo !== undefined && input.costo !== null && (typeof input.costo !== "number" || !Number.isFinite(input.costo) || input.costo < 0)) {
    throw new AppError("COSTO_INVALIDO", "El costo tiene que ser un número mayor o igual a 0.");
  }
  if (
    input.margen !== undefined &&
    input.margen !== null &&
    (typeof input.margen !== "number" || !Number.isFinite(input.margen) || input.margen <= -100 || input.margen > 10000)
  ) {
    throw new AppError("MARGEN_INVALIDO", "El margen tiene que ser un porcentaje mayor a -100.");
  }
  if (input.alicuotaIva !== undefined && !(ALICUOTAS as readonly string[]).includes(input.alicuotaIva)) {
    throw new AppError("ALICUOTA_INVALIDA", "La alícuota de IVA no es válida.");
  }
  if (
    input.impuestosInternos !== undefined &&
    (typeof input.impuestosInternos !== "number" || !Number.isFinite(input.impuestosInternos) || input.impuestosInternos < 0 || input.impuestosInternos > 100)
  ) {
    throw new AppError("INTERNOS_INVALIDOS", "Los impuestos internos tienen que ser un porcentaje entre 0 y 100.");
  }
}

// Combina lo nuevo con lo guardado y resuelve precio y margen: si viene el precio,
// manda el precio (y se recalcula el margen si hay costo); si no, con costo y margen
// conocidos se calcula el precio.
function resolverPrecio(
  condicion: CondicionIva,
  input: CamposPrecio,
  actual: { precio: number | null; costo: number | null; margen: number | null; alicuotaIva: AlicuotaIva; impuestosInternos: number }
): { precio: number; costo: number | null; margen: number | null; alicuotaIva: AlicuotaIva; impuestosInternos: number } {
  const costo = input.costo !== undefined ? input.costo : actual.costo;
  const alicuotaIva = input.alicuotaIva ?? actual.alicuotaIva;
  const impuestosInternos = input.impuestosInternos ?? actual.impuestosInternos;
  const fiscal = { condicion, alicuota: alicuotaIva, internos: impuestosInternos };
  if (input.precio !== undefined) {
    const margen = costo !== null ? margenDesde(input.precio, { ...fiscal, costo }) : input.margen !== undefined ? input.margen : actual.margen;
    return { precio: input.precio, costo, margen, alicuotaIva, impuestosInternos };
  }
  const margen = input.margen !== undefined ? input.margen : actual.margen;
  const cambioAlgo =
    input.costo !== undefined || input.margen !== undefined || input.alicuotaIva !== undefined || input.impuestosInternos !== undefined;
  if (costo !== null && margen !== null && (cambioAlgo || actual.precio === null)) {
    return { precio: calcularPrecio({ ...fiscal, costo, margen }), costo, margen, alicuotaIva, impuestosInternos };
  }
  if (actual.precio === null) {
    throw new AppError("PRECIO_INVALIDO", "Cargá el precio, o el costo y el margen de ganancia.");
  }
  return { precio: actual.precio, costo, margen, alicuotaIva, impuestosInternos };
}

export function esComprable(producto: Pick<Producto, "disponible" | "stock">): boolean {
  return producto.disponible && producto.stock > 0;
}

// Propietario o miembro con el permiso (19-equipo-tienda.md); devuelve la tienda.
async function verificarPermiso(
  usuario: Usuario,
  tiendaId: string,
  permiso: Permiso | Permiso[]
): Promise<{ plan: Plan; condicionIva: CondicionIva }> {
  await exigirPermiso(usuario, tiendaId, permiso);
  return prisma.tienda.findUniqueOrThrow({ where: { id: tiendaId }, select: { plan: true, condicionIva: true } });
}

// Permiso que pide cada campo editable de un producto (19-equipo-tienda.md).
const PERMISO_POR_CAMPO: Record<keyof ActualizarProductoInput, Permiso> = {
  nombre: "productos",
  descripcion: "productos",
  destacado: "productos",
  disponible: "productos",
  precio: "precios",
  precioOferta: "precios",
  stock: "stock",
  imagenUrl: "fotos",
  favorito: "vender",
  costo: "precios",
  margen: "precios",
  alicuotaIva: "precios",
  impuestosInternos: "precios",
};

function validarPrecio(precio: number): void {
  if (typeof precio !== "number" || Number.isNaN(precio) || precio < 0) {
    throw new AppError("PRECIO_INVALIDO", "El precio no puede ser negativo.");
  }
}

// El stock respeta la unidad del producto de catálogo (entero, o kg hasta gramos).
function validarStockDe(unidad: UnidadMedida, stock: number): number {
  validarCantidad(unidad, stock, { permitirCero: true });
  return stock;
}

function validarStock(stock: number): void {
  if (typeof stock !== "number" || Number.isNaN(stock) || stock < 0) {
    throw new AppError("STOCK_INVALIDO", "El stock no puede ser negativo.");
  }
}

interface CrearProductoDesdeCatalogoInput extends CamposPrecio {
  catalogoId: string;
  stock: number;
  imagenUrl?: string;
  descripcion?: string;
}

interface CrearProductoNuevoInput extends CamposPrecio {
  nuevo: NuevaEntradaCatalogo & { imagenUrl?: string }; // 06-catalogo.md
  stock: number;
  descripcion?: string;
}

export type CrearProductoInput = CrearProductoDesdeCatalogoInput | CrearProductoNuevoInput;

export async function crearProducto(
  vendedor: Usuario,
  tiendaId: string,
  input: CrearProductoInput
): Promise<Producto> {
  const tienda = await verificarPermiso(vendedor, tiendaId, "productos");
  validarCamposPrecio(input);
  const precio = resolverPrecio(tienda.condicionIva, input, {
    precio: null,
    costo: null,
    margen: null,
    alicuotaIva: "iva_21",
    impuestosInternos: 0,
  });
  validarStock(input.stock);
  if ("catalogoId" in input ? input.imagenUrl : input.nuevo.imagenUrl) exigirFotosPremium(tienda);
  if (!("catalogoId" in input)) validarCantidad(input.nuevo.unidad ?? "unidad", input.stock, { permitirCero: true });

  // Categoría nueva (17-rubros-categorias.md): alcanza con que la tienda (plan del
  // dueño) o el usuario que carga sea premium o mayor.
  const planUsuario = (await prisma.usuario.findUniqueOrThrow({ where: { id: vendedor.id }, select: { plan: true } })).plan;
  const catalogo =
    "catalogoId" in input
      ? await (async () => {
          const encontrado = await prisma.productoCatalogo.findUnique({ where: { id: input.catalogoId } });
          if (!encontrado) {
            throw new AppError("CATALOGO_NO_ENCONTRADO", "El producto de catálogo no existe.");
          }
          return encontrado;
        })()
      : await conCategoriaDeUsuario(vendedor, input.nuevo, [tienda.plan, planUsuario], (nuevo) =>
          crearProductoNuevoEnCatalogo({ ...nuevo, imagenUrl: input.nuevo.imagenUrl }).then((p) =>
            prisma.productoCatalogo.findUniqueOrThrow({ where: { id: p.id } })
          )
        );

  const producto = await prisma.producto.create({
    data: {
      tiendaId,
      catalogoId: catalogo.id,
      nombre: catalogo.nombre,
      descripcion: input.descripcion ?? null,
      categoriaId: catalogo.categoriaId,
      // La foto del catálogo NO se copia: se resuelve en imagenEfectiva. Esta
      // columna es solo la foto personalizada (premium).
      imagenUrl: "catalogoId" in input ? (input.imagenUrl ?? null) : null,
      ...precio,
      stock: validarStockDe(catalogo.unidad, input.stock),
    },
    include: INCLUDE_IMAGEN,
  });

  // 12-gamificacion.md
  await sinRomper(() => otorgarPorProductoCargado(vendedor.id, tiendaId, catalogo.id));
  if (producto.imagenUrl) await sinRomper(() => otorgarPorFotoCargada(vendedor.id, tiendaId, catalogo.id));

  return aProducto(producto);
}

export type SortProductos = "precio_asc" | "precio_desc" | "alfabetico" | "mas_vendidos" | "rating";
export type TabProductos = "ofertas" | "nuevos" | "destacados";

export interface ListarProductosInput {
  tiendaId: string;
  soloDisponibles?: boolean;
  categoriaId?: string;
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
    const cantidadPorId = new Map(agregados.map((a) => [a.productoId, Number(a._sum.cantidad ?? 0)]));
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
    eliminadoEn: null,
    ...(input.soloDisponibles ? { disponible: true, stock: { gt: 0 } } : {}),
    ...(input.categoriaId ? { categoriaId: input.categoriaId } : {}),
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

// Pestañas del punto de venta (03-productos.md, `?paraVenta=1`): todos los productos
// de la tienda con cuántos tickets no anulados los incluyeron en los últimos 30 días y
// la fecha de la última venta (cualquier fecha) que los incluyó.
export interface ProductoParaVenta extends Producto {
  vendidos30d: number;
  ultimaVentaEn: string | null;
  codigoBarras: string | null; // del catálogo: "Escanear producto" (05-ventas.md)
}

export async function listarParaVenta(vendedor: Usuario, tiendaId: string): Promise<ProductoParaVenta[]> {
  await verificarPermiso(vendedor, tiendaId, "vender");
  const desde = new Date(Date.now() - 30 * 24 * 3600_000);
  const [productos, ventas] = await Promise.all([
    prisma.producto.findMany({
      where: { tiendaId, eliminadoEn: null },
      include: { ...INCLUDE_IMAGEN, catalogo: { select: { imagenUrl: true, unidad: true, codigoBarras: true } } },
      orderBy: { nombre: "asc" },
    }),
    prisma.$queryRaw<Array<{ producto_id: string; vendidos_30d: number; ultima_venta_en: Date }>>`
      SELECT iv.producto_id,
             COUNT(DISTINCT v.id) FILTER (WHERE v.creada_en >= ${desde})::int AS vendidos_30d,
             MAX(v.creada_en) AS ultima_venta_en
      FROM items_venta iv
      JOIN ventas v ON v.id = iv.venta_id
      WHERE v.tienda_id = ${tiendaId} AND v.estado <> 'anulada'
      GROUP BY iv.producto_id
    `,
  ]);
  const porProducto = new Map(ventas.map((v) => [v.producto_id, v]));
  return productos.map((p) => {
    const venta = porProducto.get(p.id);
    return {
      ...aProducto(p),
      vendidos30d: venta?.vendidos_30d ?? 0,
      ultimaVentaEn: venta ? venta.ultima_venta_en.toISOString() : null,
      codigoBarras: p.catalogo.codigoBarras,
    };
  });
}

export interface ActualizarProductoInput extends CamposPrecio {
  nombre?: string;
  descripcion?: string;
  imagenUrl?: string | null;
  precioOferta?: number | null;
  destacado?: boolean;
  stock?: number;
  disponible?: boolean;
  favorito?: boolean;
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
  // 03-productos.md: un producto eliminado ya no existe para la tienda.
  if (!producto || producto.eliminadoEn) {
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
  // Cada campo que viene pide su permiso; hacen falta todos.
  const campos = (Object.keys(input) as Array<keyof ActualizarProductoInput>).filter(
    (k) => input[k] !== undefined && k in PERMISO_POR_CAMPO
  );
  const permisos = [...new Set(campos.map((k) => PERMISO_POR_CAMPO[k]))];
  if (permisos.length === 0) await exigirPermiso(vendedor, actual.tiendaId, PERMISOS.slice());
  for (const permiso of permisos) await exigirPermiso(vendedor, actual.tiendaId, permiso);

  validarCamposPrecio(input);
  const precio = resolverPrecio(actual.tienda.condicionIva, input, {
    precio: Number(actual.precio),
    costo: actual.costo === null ? null : Number(actual.costo),
    margen: actual.margen === null ? null : Number(actual.margen),
    alicuotaIva: actual.alicuotaIva,
    impuestosInternos: Number(actual.impuestosInternos),
  });
  if (input.stock !== undefined) {
    validarStock(input.stock);
    const { unidad } = await prisma.productoCatalogo.findUniqueOrThrow({
      where: { id: actual.catalogoId },
      select: { unidad: true },
    });
    validarStockDe(unidad, input.stock);
  }
  validarPrecioOferta(input.precioOferta, precio.precio);
  if (input.imagenUrl) exigirFotosPremium(actual.tienda);
  if (input.favorito !== undefined && typeof input.favorito !== "boolean") {
    throw new AppError("FAVORITO_INVALIDO", "favorito debe ser true o false.");
  }

  const producto = await prisma.producto.update({
    where: { id: productoId },
    data: {
      nombre: input.nombre,
      descripcion: input.descripcion,
      imagenUrl: input.imagenUrl,
      ...precio,
      precioOferta: input.precioOferta,
      destacado: input.destacado,
      stock: input.stock,
      disponible: input.disponible,
      favorito: input.favorito,
    },
    include: INCLUDE_IMAGEN,
  });

  if (input.imagenUrl) {
    await sinRomper(() => otorgarPorFotoCargada(vendedor.id, producto.tiendaId, producto.catalogoId));
  }

  return aProducto(producto);
}

export async function eliminarProducto(vendedor: Usuario, productoId: string): Promise<Producto> {
  const actual = await obtenerProductoConTienda(productoId);
  await exigirPermiso(vendedor, actual.tiendaId, "productos");

  const producto = await prisma.producto.update({
    where: { id: productoId },
    data: { disponible: false, stock: 0, eliminadoEn: new Date() },
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
  if (Number(producto.stock) < cantidad) {
    throw new AppError("STOCK_INSUFICIENTE", "No hay stock suficiente para debitar.");
  }

  const actualizado = await prisma.producto.update({
    where: { id: productoId },
    data: { stock: { decrement: cantidad } },
    include: INCLUDE_IMAGEN,
  });

  return aProducto(actualizado);
}
