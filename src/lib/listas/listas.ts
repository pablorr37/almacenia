// Listas de compras del comprador (specs/sdd/14-listas-compras.md).
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import type { Usuario } from "@/lib/auth/auth";
import type { Categoria } from "@/generated-prisma/client";

const PAGE_SIZE_DEFAULT = 20;
const PAGE_SIZE_MAXIMO = 100;
const MAX_ITEMS = 100;
const MAX_NOMBRE = 80;

export interface ItemListaInput {
  catalogoId: string;
  cantidad: number;
}

export interface ItemListaCompras {
  id: string;
  catalogoId: string;
  cantidad: number;
  producto: { nombre: string; marca: string | null; imagenUrl: string | null; categoria: Categoria | null };
}

export interface ListaCompras {
  id: string;
  compradorId: string;
  nombre: string;
  items: ItemListaCompras[];
  creadaEn: string;
  actualizadaEn: string;
}

export interface ResumenLista {
  id: string;
  nombre: string;
  cantidadItems: number;
  actualizadaEn: string;
}

const INCLUDE_ITEMS = {
  items: {
    include: { catalogo: { select: { nombre: true, marca: true, imagenUrl: true, categoria: true } } },
    orderBy: { catalogo: { nombre: "asc" as const } },
  },
};

type ListaDb = Awaited<ReturnType<typeof buscarListaPropia>>;

function aLista(lista: NonNullable<ListaDb>): ListaCompras {
  return {
    id: lista.id,
    compradorId: lista.compradorId,
    nombre: lista.nombre,
    items: lista.items.map((i) => ({
      id: i.id,
      catalogoId: i.catalogoId,
      cantidad: i.cantidad,
      producto: i.catalogo,
    })),
    creadaEn: lista.creadaEn.toISOString(),
    actualizadaEn: lista.actualizadaEn.toISOString(),
  };
}

function itemsInvalidos(): AppError {
  return new AppError(
    "ITEMS_LISTA_INVALIDOS",
    `Los ítems deben ser hasta ${MAX_ITEMS} productos del catálogo con cantidad entera mayor a 0.`
  );
}

// Pura: valida la forma y suma cantidades de productos repetidos.
export function normalizarItems(items: unknown): ItemListaInput[] {
  if (!Array.isArray(items)) throw itemsInvalidos();
  const porCatalogo = new Map<string, number>();
  for (const item of items) {
    const { catalogoId, cantidad } = (item ?? {}) as Partial<ItemListaInput>;
    if (typeof catalogoId !== "string" || catalogoId.length === 0) throw itemsInvalidos();
    if (typeof cantidad !== "number" || !Number.isInteger(cantidad) || cantidad < 1) throw itemsInvalidos();
    porCatalogo.set(catalogoId, (porCatalogo.get(catalogoId) ?? 0) + cantidad);
  }
  if (porCatalogo.size > MAX_ITEMS) throw itemsInvalidos();
  return [...porCatalogo].map(([catalogoId, cantidad]) => ({ catalogoId, cantidad }));
}

function normalizarNombre(nombre: unknown): string {
  const limpio = typeof nombre === "string" ? nombre.trim() : "";
  if (limpio.length === 0 || limpio.length > MAX_NOMBRE) {
    throw new AppError("NOMBRE_LISTA_INVALIDO", `El nombre de la lista debe tener entre 1 y ${MAX_NOMBRE} caracteres.`);
  }
  return limpio;
}

async function verificarCatalogo(items: ItemListaInput[]): Promise<void> {
  if (items.length === 0) return;
  const ids = items.map((i) => i.catalogoId);
  const existentes = await prisma.productoCatalogo.count({ where: { id: { in: ids } } });
  if (existentes !== ids.length) {
    throw new AppError("CATALOGO_NO_ENCONTRADO", "Algún producto de la lista no existe en el catálogo.");
  }
}

async function buscarListaPropia(comprador: Usuario, listaId: string) {
  return prisma.listaCompras.findFirst({ where: { id: listaId, compradorId: comprador.id }, include: INCLUDE_ITEMS });
}

// Una lista ajena responde igual que una inexistente, para no revelar que existe.
async function exigirListaPropia(comprador: Usuario, listaId: string) {
  const lista = await buscarListaPropia(comprador, listaId);
  if (!lista) throw new AppError("LISTA_NO_ENCONTRADA", "La lista no existe.");
  return lista;
}

export async function crearLista(
  comprador: Usuario,
  input: { nombre: string; items: ItemListaInput[] }
): Promise<ListaCompras> {
  const nombre = normalizarNombre(input.nombre);
  const items = normalizarItems(input.items ?? []);
  await verificarCatalogo(items);

  const lista = await prisma.listaCompras.create({
    data: { compradorId: comprador.id, nombre, items: { create: items } },
    include: INCLUDE_ITEMS,
  });
  return aLista(lista);
}

export async function listarListas(
  comprador: Usuario,
  paginacion: { page?: number; pageSize?: number }
): Promise<{ data: ResumenLista[]; page: number; pageSize: number; total: number }> {
  const page = paginacion.page && paginacion.page > 0 ? paginacion.page : 1;
  const pageSize =
    paginacion.pageSize && paginacion.pageSize > 0 ? Math.min(paginacion.pageSize, PAGE_SIZE_MAXIMO) : PAGE_SIZE_DEFAULT;
  const where = { compradorId: comprador.id };

  const [listas, total] = await Promise.all([
    prisma.listaCompras.findMany({
      where,
      include: { _count: { select: { items: true } } },
      orderBy: [{ actualizadaEn: "desc" }, { creadaEn: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.listaCompras.count({ where }),
  ]);

  return {
    data: listas.map((l) => ({
      id: l.id,
      nombre: l.nombre,
      cantidadItems: l._count.items,
      actualizadaEn: l.actualizadaEn.toISOString(),
    })),
    page,
    pageSize,
    total,
  };
}

export async function obtenerLista(comprador: Usuario, listaId: string): Promise<ListaCompras> {
  return aLista(await exigirListaPropia(comprador, listaId));
}

export async function actualizarLista(
  comprador: Usuario,
  listaId: string,
  input: { nombre?: string; items?: ItemListaInput[] }
): Promise<ListaCompras> {
  await exigirListaPropia(comprador, listaId);
  const nombre = input.nombre !== undefined ? normalizarNombre(input.nombre) : undefined;
  const items = input.items !== undefined ? normalizarItems(input.items) : undefined;
  if (items) await verificarCatalogo(items);

  const lista = await prisma.$transaction(async (tx) => {
    if (items) {
      await tx.itemListaCompras.deleteMany({ where: { listaId } });
      await tx.itemListaCompras.createMany({ data: items.map((i) => ({ ...i, listaId })) });
    }
    // Siempre se toca la fila para que actualizadaEn refleje el cambio de ítems.
    return tx.listaCompras.update({
      where: { id: listaId },
      data: { nombre, actualizadaEn: new Date() },
      include: INCLUDE_ITEMS,
    });
  });
  return aLista(lista);
}

export async function eliminarLista(comprador: Usuario, listaId: string): Promise<{ id: string }> {
  await exigirListaPropia(comprador, listaId);
  await prisma.listaCompras.delete({ where: { id: listaId } });
  return { id: listaId };
}
