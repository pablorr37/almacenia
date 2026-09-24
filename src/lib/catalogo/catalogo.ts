import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
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
