import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import type { Usuario } from "@/lib/auth/auth";
import { tienePermiso } from "@/lib/planes/planes";
import type { UnidadMedida } from "@/lib/productos/unidades";
import { sinRomper, otorgarPorFotoCargada } from "@/lib/gamificacion/gamificacion";
import { exigirTextoPermitido } from "@/lib/moderacion/moderacion";
import { normalizarNombre } from "@/lib/rubros-categorias/rubros-categorias";
import type { Prisma } from "@/generated-prisma/client";

import { UNIDADES_CONTENIDO, componerNombreCatalogo, type UnidadContenido } from "./nombre";
export { UNIDADES_CONTENIDO, componerNombreCatalogo, type UnidadContenido };

export interface ProductoCatalogo {
  id: string;
  nombre: string;
  descripcion: string | null;
  marca: string | null;
  categoria: { id: string; nombre: string };
  variante: string | null;
  contenido: number | null;
  unidadContenido: UnidadContenido | null;
  codigoBarras: string | null;
  imagenUrl: string | null;
  unidad: UnidadMedida;
}

export const INCLUDE_CATEGORIA = { categoria: { select: { id: true, nombre: true } } } as const;
type FilaCatalogo = Prisma.ProductoCatalogoGetPayload<{ include: typeof INCLUDE_CATEGORIA }>;

export function aProductoCatalogo(p: FilaCatalogo): ProductoCatalogo {
  return {
    id: p.id,
    nombre: p.nombre,
    descripcion: p.descripcion,
    marca: p.marca,
    categoria: p.categoria,
    variante: p.variante,
    contenido: p.contenido === null ? null : Number(p.contenido),
    unidadContenido: p.unidadContenido,
    codigoBarras: p.codigoBarras,
    imagenUrl: p.imagenUrl,
    unidad: p.unidad,
  };
}

export interface BuscarEnCatalogoInput {
  q?: string;
  codigoBarras?: string;
}

export async function buscarEnCatalogo(input: BuscarEnCatalogoInput): Promise<ProductoCatalogo[]> {
  if (!input.q && !input.codigoBarras) {
    throw new AppError("BUSQUEDA_CATALOGO_INVALIDA", "Hay que pasar q o codigoBarras para buscar.");
  }

  const productos = await prisma.productoCatalogo.findMany({
    where: input.codigoBarras
      ? { codigoBarras: input.codigoBarras }
      : { nombre: { contains: input.q, mode: "insensitive" } },
    include: INCLUDE_CATEGORIA,
    take: 20,
    orderBy: { nombre: "asc" },
  });

  return productos.map(aProductoCatalogo);
}

export async function obtenerProductoCatalogo(id: string): Promise<ProductoCatalogo | null> {
  const producto = await prisma.productoCatalogo.findUnique({ where: { id }, include: INCLUDE_CATEGORIA });
  return producto ? aProductoCatalogo(producto) : null;
}

// Datos de una entrada nueva del catálogo (06-catalogo.md).
export interface NuevaEntradaCatalogo {
  categoriaId: string;
  marca?: string;
  variante?: string;
  contenido?: number;
  unidadContenido?: UnidadContenido;
  unidad?: UnidadMedida; // default 'unidad'
  codigoBarras?: string;
}

export type CrearProductoNuevoEnCatalogoInput = NuevaEntradaCatalogo & {
  descripcion?: string;
  imagenUrl?: string;
};

function textoOpcional(valor: unknown, campo: string): string | null {
  if (valor === undefined || valor === null) return null;
  const texto = typeof valor === "string" ? valor.replace(/\s+/g, " ").trim() : "";
  if (!texto) return null;
  if (texto.length > 40) throw new AppError("TEXTO_INVALIDO", `${campo} puede tener hasta 40 caracteres.`);
  exigirTextoPermitido(texto, campo);
  return texto;
}

// Valida y normaliza una entrada nueva; devuelve los datos listos para guardar.
async function prepararEntrada(input: NuevaEntradaCatalogo) {
  const unidad = input.unidad ?? "unidad";
  if (unidad !== "unidad" && unidad !== "kg") {
    throw new AppError("UNIDAD_INVALIDA", "La unidad tiene que ser 'unidad' o 'kg'.");
  }
  const categoria =
    typeof input.categoriaId === "string" && input.categoriaId
      ? await prisma.categoriaProducto.findUnique({ where: { id: input.categoriaId } })
      : null;
  if (!categoria) throw new AppError("CATEGORIA_NO_ENCONTRADA", "Elegí una categoría de la lista.");

  const marca = textoOpcional(input.marca, "La marca");
  const variante = textoOpcional(input.variante, "La variante");

  const hayContenido = input.contenido !== undefined && input.contenido !== null;
  const hayUnidadContenido = input.unidadContenido !== undefined && input.unidadContenido !== null;
  if (hayContenido || hayUnidadContenido) {
    if (unidad === "kg") {
      throw new AppError("CONTENIDO_INVALIDO", "Un producto suelto por kg no lleva contenido de envase.");
    }
    const valido =
      typeof input.contenido === "number" &&
      Number.isFinite(input.contenido) &&
      input.contenido > 0 &&
      (UNIDADES_CONTENIDO as readonly string[]).includes(input.unidadContenido as string);
    if (!valido) {
      throw new AppError("CONTENIDO_INVALIDO", "El contenido tiene que ser un número mayor a 0 con su unidad (g, kg, ml, l o u).");
    }
  }
  const contenido = hayContenido ? Math.round((input.contenido as number) * 1000) / 1000 : null;
  const unidadContenido = hayContenido ? (input.unidadContenido as UnidadContenido) : null;

  return {
    categoriaId: categoria.id,
    marca,
    variante,
    contenido,
    unidadContenido,
    unidad,
    nombre: componerNombreCatalogo({ categoria: categoria.nombre, marca, variante, contenido, unidadContenido }),
  };
}

type EntradaPreparada = Awaited<ReturnType<typeof prepararEntrada>>;

// Regla "Sin duplicados" de 06-catalogo.md: misma categoría, unidad y contenido, y
// misma marca y variante normalizadas.
async function buscarDuplicado(datos: EntradaPreparada): Promise<FilaCatalogo | null> {
  const candidatas = await prisma.productoCatalogo.findMany({
    where: {
      categoriaId: datos.categoriaId,
      unidad: datos.unidad,
      contenido: datos.contenido,
      unidadContenido: datos.unidadContenido,
    },
    include: INCLUDE_CATEGORIA,
    orderBy: { creadoEn: "asc" },
  });
  const clave = (t: string | null) => normalizarNombre(t ?? "");
  return (
    candidatas.find((c) => clave(c.marca) === clave(datos.marca) && clave(c.variante) === clave(datos.variante)) ?? null
  );
}

export async function crearProductoNuevoEnCatalogo(
  input: CrearProductoNuevoEnCatalogoInput
): Promise<ProductoCatalogo> {
  const datos = await prepararEntrada(input);
  if (input.codigoBarras) {
    const existente = await prisma.productoCatalogo.findUnique({
      where: { codigoBarras: input.codigoBarras },
    });
    if (existente) {
      throw new AppError("CODIGO_BARRAS_DUPLICADO", "Ya existe un producto con ese código de barras.");
    }
  }

  const duplicado = await buscarDuplicado(datos);
  if (duplicado) return aProductoCatalogo(duplicado);

  const producto = await prisma.productoCatalogo.create({
    data: {
      ...datos,
      descripcion: input.descripcion ?? null,
      codigoBarras: input.codigoBarras ?? null,
      imagenUrl: input.imagenUrl ?? null,
    },
    include: INCLUDE_CATEGORIA,
  });

  return aProductoCatalogo(producto);
}

// Foto del catálogo (06-catalogo.md): admin siempre; vendedor premium solo si la
// entrada todavía no tiene foto. Devuelve también la tienda del vendedor (null si
// es admin sin tienda) para que el llamador otorgue puntos (12-gamificacion.md).
export async function verificarPermisoFotoCatalogo(
  usuario: Usuario,
  catalogoId: string
): Promise<{ tiendaId: string | null }> {
  const entrada = await prisma.productoCatalogo.findUnique({ where: { id: catalogoId } });
  if (!entrada) {
    throw new AppError("CATALOGO_NO_ENCONTRADO", "El producto de catálogo no existe.");
  }
  const tienda = await prisma.tienda.findUnique({ where: { vendedorId: usuario.id }, select: { id: true, plan: true } });
  if (usuario.esAdmin) return { tiendaId: tienda?.id ?? null };

  if (!tienda || !tienePermiso(tienda, "fotos_personalizadas")) {
    throw new AppError("FOTOS_SOLO_PREMIUM", "Subir fotos de productos es una función del plan premium.");
  }
  if (entrada.imagenUrl) {
    throw new AppError("CATALOGO_YA_TIENE_FOTO", "Este producto ya tiene foto en el catálogo.");
  }
  return { tiendaId: tienda.id };
}

export async function asignarFotoCatalogo(
  usuario: Usuario,
  catalogoId: string,
  imagenUrl: string
): Promise<ProductoCatalogo> {
  const { tiendaId } = await verificarPermisoFotoCatalogo(usuario, catalogoId);
  const actualizado = await prisma.productoCatalogo.update({
    where: { id: catalogoId },
    data: { imagenUrl },
    include: INCLUDE_CATEGORIA,
  });
  // foto_cargada es para vendedores (12-gamificacion.md); un admin no suma.
  if (tiendaId && !usuario.esAdmin) {
    await sinRomper(() => otorgarPorFotoCargada(usuario.id, tiendaId, catalogoId));
  }
  return aProductoCatalogo(actualizado);
}

// Alta desde una lista de compras (06-catalogo.md / 14-listas-compras.md): cualquier
// usuario suma al catálogo compartido un producto que no encuentra. Sin duplicar, con
// filtro de groserías y un límite diario por usuario.
const LIMITE_ALTAS_POR_DIA = 20;

export type SumarAlCatalogoInput = Omit<NuevaEntradaCatalogo, "codigoBarras">;

export async function sumarAlCatalogo(
  usuario: Usuario,
  input: SumarAlCatalogoInput
): Promise<{ producto: ProductoCatalogo; creado: boolean }> {
  const datos = await prepararEntrada({ ...input, codigoBarras: undefined });

  const existente = await buscarDuplicado(datos);
  if (existente) return { producto: aProductoCatalogo(existente), creado: false };

  const desde = new Date(Date.now() - 24 * 3600_000);
  const altasHoy = await prisma.productoCatalogo.count({ where: { creadoPorId: usuario.id, creadoEn: { gte: desde } } });
  if (altasHoy >= LIMITE_ALTAS_POR_DIA) {
    throw new AppError("LIMITE_ALTAS_CATALOGO", `Podés sumar hasta ${LIMITE_ALTAS_POR_DIA} productos al catálogo por día.`);
  }

  const creado = await prisma.productoCatalogo.create({
    data: { ...datos, creadoPorId: usuario.id },
    include: INCLUDE_CATEGORIA,
  });
  return { producto: aProductoCatalogo(creado), creado: true };
}
