// Rubros de negocio y categorías de producto (specs/sdd/17-rubros-categorias.md):
// listas que mantiene el admin; cualquiera las lee.
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { requireAdmin, type Usuario } from "@/lib/auth/auth";
import { exigirTextoPermitido } from "@/lib/moderacion/moderacion";

export interface Rubro {
  id: string;
  nombre: string;
  orden: number;
}

export interface CategoriaProducto {
  id: string;
  nombre: string;
}

// Pura: clave de unicidad ("Verdulería " y "verduleria" son lo mismo).
export function normalizarNombre(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function validarNombre(texto: unknown): { nombre: string; nombreNormalizado: string } {
  const nombre = typeof texto === "string" ? texto.replace(/\s+/g, " ").trim() : "";
  if (nombre.length < 2 || nombre.length > 40) {
    throw new AppError("NOMBRE_INVALIDO", "El nombre tiene que tener entre 2 y 40 caracteres.");
  }
  exigirTextoPermitido(nombre, "El nombre");
  return { nombre, nombreNormalizado: normalizarNombre(nombre) };
}

function esDuplicado(error: unknown): boolean {
  return (error as { code?: string })?.code === "P2002";
}

const DUPLICADO = () => new AppError("NOMBRE_DUPLICADO", "Ya existe uno con ese nombre.");

const aRubro = (r: { id: string; nombre: string; orden: number }): Rubro => ({ id: r.id, nombre: r.nombre, orden: r.orden });
const aCategoria = (c: { id: string; nombre: string }): CategoriaProducto => ({ id: c.id, nombre: c.nombre });

// ---------------------------------------------------------------------------
// Rubros
// ---------------------------------------------------------------------------

export async function listarRubros(): Promise<Rubro[]> {
  const filas = await prisma.rubro.findMany({ orderBy: [{ orden: "asc" }, { nombre: "asc" }] });
  return filas.map(aRubro);
}

async function exigirRubro(id: string) {
  const rubro = await prisma.rubro.findUnique({ where: { id } });
  if (!rubro) throw new AppError("RUBRO_NO_ENCONTRADO", "El rubro no existe.");
  return rubro;
}

function validarOrden(orden: unknown): number | undefined {
  if (orden === undefined) return undefined;
  if (typeof orden !== "number" || !Number.isInteger(orden)) {
    throw new AppError("ORDEN_INVALIDO", "El orden tiene que ser un número entero.");
  }
  return orden;
}

export async function crearRubro(admin: Usuario, input: { nombre: string; orden?: number }): Promise<Rubro> {
  requireAdmin(admin);
  const datos = validarNombre(input.nombre);
  const orden = validarOrden(input.orden);
  try {
    return aRubro(await prisma.rubro.create({ data: { ...datos, ...(orden !== undefined ? { orden } : {}) } }));
  } catch (error) {
    if (esDuplicado(error)) throw DUPLICADO();
    throw error;
  }
}

export async function actualizarRubro(
  admin: Usuario,
  id: string,
  input: { nombre?: string; orden?: number }
): Promise<Rubro> {
  requireAdmin(admin);
  await exigirRubro(id);
  const datos = input.nombre !== undefined ? validarNombre(input.nombre) : {};
  const orden = validarOrden(input.orden);
  try {
    return aRubro(
      await prisma.rubro.update({ where: { id }, data: { ...datos, ...(orden !== undefined ? { orden } : {}) } })
    );
  } catch (error) {
    if (esDuplicado(error)) throw DUPLICADO();
    throw error;
  }
}

export async function eliminarRubro(admin: Usuario, id: string): Promise<void> {
  requireAdmin(admin);
  await exigirRubro(id);
  const enUso = await prisma.tienda.count({ where: { rubroId: id } });
  if (enUso > 0) {
    throw new AppError("RUBRO_EN_USO", `Hay ${enUso} tienda(s) con este rubro. Cambiales el rubro antes de borrarlo.`);
  }
  await prisma.rubro.delete({ where: { id } });
}

// ---------------------------------------------------------------------------
// Categorías de producto
// ---------------------------------------------------------------------------

export async function listarCategorias(q?: string): Promise<CategoriaProducto[]> {
  const filtro = q ? normalizarNombre(q) : "";
  const filas = await prisma.categoriaProducto.findMany({
    where: filtro ? { nombreNormalizado: { contains: filtro } } : {},
  });
  return filas.map(aCategoria).sort((a, b) => a.nombre.localeCompare(b.nombre, "es-AR"));
}

async function exigirCategoria(id: string) {
  const categoria = await prisma.categoriaProducto.findUnique({ where: { id } });
  if (!categoria) throw new AppError("CATEGORIA_NO_ENCONTRADA", "La categoría no existe.");
  return categoria;
}

export async function crearCategoria(admin: Usuario, input: { nombre: string }): Promise<CategoriaProducto> {
  requireAdmin(admin);
  const datos = validarNombre(input.nombre);
  try {
    return aCategoria(await prisma.categoriaProducto.create({ data: datos }));
  } catch (error) {
    if (esDuplicado(error)) throw DUPLICADO();
    throw error;
  }
}

export async function actualizarCategoria(
  admin: Usuario,
  id: string,
  input: { nombre?: string }
): Promise<CategoriaProducto> {
  requireAdmin(admin);
  await exigirCategoria(id);
  if (input.nombre === undefined) return aCategoria(await exigirCategoria(id));
  const datos = validarNombre(input.nombre);
  try {
    return aCategoria(await prisma.categoriaProducto.update({ where: { id }, data: datos }));
  } catch (error) {
    if (esDuplicado(error)) throw DUPLICADO();
    throw error;
  }
}

export async function eliminarCategoria(admin: Usuario, id: string): Promise<void> {
  requireAdmin(admin);
  await exigirCategoria(id);
  const enUso = await prisma.productoCatalogo.count({ where: { categoriaId: id } });
  if (enUso > 0) {
    throw new AppError("CATEGORIA_EN_USO", `Hay ${enUso} producto(s) del catálogo en esta categoría.`);
  }
  await prisma.categoriaProducto.delete({ where: { id } });
}
