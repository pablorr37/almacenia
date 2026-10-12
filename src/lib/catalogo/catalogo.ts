import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import type { Usuario } from "@/lib/auth/auth";
import { tienePermiso } from "@/lib/planes/planes";
import type { UnidadMedida } from "@/lib/productos/unidades";
import { sinRomper, otorgarPorFotoCargada } from "@/lib/gamificacion/gamificacion";
import { exigirTextoPermitido } from "@/lib/moderacion/moderacion";
import type { Categoria, ProductoCatalogo as ProductoCatalogoDb } from "@/generated-prisma/client";

export interface ProductoCatalogo {
  id: string;
  nombre: string;
  descripcion: string | null;
  marca: string | null;
  categoria: Categoria | null;
  codigoBarras: string | null;
  imagenUrl: string | null;
  unidad: UnidadMedida;
}

function aProductoCatalogo(p: ProductoCatalogoDb): ProductoCatalogo {
  return {
    id: p.id,
    nombre: p.nombre,
    descripcion: p.descripcion,
    marca: p.marca,
    categoria: p.categoria,
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
    take: 20,
    orderBy: { nombre: "asc" },
  });

  return productos.map(aProductoCatalogo);
}

export async function obtenerProductoCatalogo(id: string): Promise<ProductoCatalogo | null> {
  const producto = await prisma.productoCatalogo.findUnique({ where: { id } });
  return producto ? aProductoCatalogo(producto) : null;
}

export interface CrearProductoNuevoEnCatalogoInput {
  nombre: string;
  descripcion?: string;
  marca?: string;
  categoria?: Categoria;
  codigoBarras?: string;
  imagenUrl?: string;
  unidad?: UnidadMedida; // default 'unidad'
}

export async function crearProductoNuevoEnCatalogo(
  input: CrearProductoNuevoEnCatalogoInput
): Promise<ProductoCatalogo> {
  if (input.unidad !== undefined && input.unidad !== "unidad" && input.unidad !== "kg") {
    throw new AppError("UNIDAD_INVALIDA", "La unidad tiene que ser 'unidad' o 'kg'.");
  }
  if (input.codigoBarras) {
    const existente = await prisma.productoCatalogo.findUnique({
      where: { codigoBarras: input.codigoBarras },
    });
    if (existente) {
      throw new AppError("CODIGO_BARRAS_DUPLICADO", "Ya existe un producto con ese código de barras.");
    }
  }

  const producto = await prisma.productoCatalogo.create({
    data: {
      nombre: input.nombre,
      descripcion: input.descripcion ?? null,
      marca: input.marca ?? null,
      categoria: input.categoria ?? null,
      codigoBarras: input.codigoBarras ?? null,
      imagenUrl: input.imagenUrl ?? null,
      unidad: input.unidad ?? "unidad",
    },
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
  const actualizado = await prisma.productoCatalogo.update({ where: { id: catalogoId }, data: { imagenUrl } });
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

function normalizarNombreCatalogo(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

export interface SumarAlCatalogoInput {
  nombre: string;
  marca?: string;
  categoria?: Categoria;
  unidad?: UnidadMedida;
}

export async function sumarAlCatalogo(
  usuario: Usuario,
  input: SumarAlCatalogoInput
): Promise<{ producto: ProductoCatalogo; creado: boolean }> {
  const nombre = typeof input.nombre === "string" ? input.nombre.trim().replace(/\s+/g, " ") : "";
  if (nombre.length < 2 || nombre.length > 80) {
    throw new AppError("NOMBRE_CATALOGO_INVALIDO", "El nombre tiene que tener entre 2 y 80 caracteres.");
  }
  const marca = input.marca?.trim() || undefined;
  if (input.unidad !== undefined && input.unidad !== "unidad" && input.unidad !== "kg") {
    throw new AppError("UNIDAD_INVALIDA", "La unidad tiene que ser 'unidad' o 'kg'.");
  }
  exigirTextoPermitido(nombre, "El nombre");
  if (marca) exigirTextoPermitido(marca, "La marca");

  // Mismo nombre y marca normalizados → se reutiliza la entrada existente.
  const clave = normalizarNombreCatalogo(nombre);
  const claveMarca = normalizarNombreCatalogo(marca ?? "");
  // translate() en vez de unaccent: no requiere extensiones de Postgres.
  const coincidencias = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM productos_catalogo
    WHERE regexp_replace(translate(lower(nombre), 'áéíóúüñàèìòù', 'aeiouunaeiou'), '\s+', ' ', 'g') = ${clave.replace(/ñ/g, "n")}
      AND regexp_replace(translate(lower(coalesce(marca, '')), 'áéíóúüñàèìòù', 'aeiouunaeiou'), '\s+', ' ', 'g') = ${claveMarca.replace(/ñ/g, "n")}
    ORDER BY creado_en ASC
    LIMIT 1
  `;
  const existente = coincidencias[0]
    ? await prisma.productoCatalogo.findUnique({ where: { id: coincidencias[0].id } })
    : null;
  if (existente) return { producto: aProductoCatalogo(existente), creado: false };

  const desde = new Date(Date.now() - 24 * 3600_000);
  const altasHoy = await prisma.productoCatalogo.count({ where: { creadoPorId: usuario.id, creadoEn: { gte: desde } } });
  if (altasHoy >= LIMITE_ALTAS_POR_DIA) {
    throw new AppError("LIMITE_ALTAS_CATALOGO", `Podés sumar hasta ${LIMITE_ALTAS_POR_DIA} productos al catálogo por día.`);
  }

  const creado = await prisma.productoCatalogo.create({
    data: {
      nombre,
      marca: marca ?? null,
      categoria: input.categoria ?? null,
      unidad: input.unidad ?? "unidad",
      creadoPorId: usuario.id,
    },
  });
  return { producto: aProductoCatalogo(creado), creado: true };
}
