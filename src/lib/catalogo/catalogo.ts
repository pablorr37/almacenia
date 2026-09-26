import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import type { Usuario } from "@/lib/auth/auth";
import { tienePermiso } from "@/lib/planes/planes";
import type { Categoria, ProductoCatalogo as ProductoCatalogoDb } from "@/generated-prisma/client";

export interface ProductoCatalogo {
  id: string;
  nombre: string;
  descripcion: string | null;
  marca: string | null;
  categoria: Categoria | null;
  codigoBarras: string | null;
  imagenUrl: string | null;
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
}

export async function crearProductoNuevoEnCatalogo(
  input: CrearProductoNuevoEnCatalogoInput
): Promise<ProductoCatalogo> {
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
  await verificarPermisoFotoCatalogo(usuario, catalogoId);
  const actualizado = await prisma.productoCatalogo.update({ where: { id: catalogoId }, data: { imagenUrl } });
  return aProductoCatalogo(actualizado);
}
