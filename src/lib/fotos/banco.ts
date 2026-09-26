// Banco de fotos curado (specs/sdd/16-banco-fotos.md): fotos libres aprobadas por
// curadores (admin/tester) y subidas propias. Todas viven en nuestro bucket.
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated-prisma/client";
import type { Plan, FotoBanco as FotoBancoDb } from "@/generated-prisma/client";
import { AppError } from "@/lib/errors";
import type { Usuario } from "@/lib/auth/auth";
import { subirArchivo, validarImagen } from "@/lib/archivos/archivos";
import { actualizarProducto } from "@/lib/productos/productos";
import { sinRomper, otorgarPorFotoCargada } from "@/lib/gamificacion/gamificacion";
import { palabrasClave, type ResultadoWeb } from "./buscador-web";

export interface FotoBanco {
  id: string;
  url: string;
  fuente: "web" | "subida";
  estado: "pendiente" | "aprobada" | "rechazada";
  etiquetas: string[];
  titulo: string | null;
  autor: string | null;
  licencia: string | null;
  origenUrl: string | null;
  subidaPorId: string | null;
  creadaEn: string;
}

export type Fuente = "web" | "curado" | "subidas" | "propias";

const PAGE_SIZE_DEFAULT = 24;
const PAGE_SIZE_MAXIMO = 60;
const MAX_ETIQUETAS = 20;
const MAX_LARGO_ETIQUETA = 40;
const TIMEOUT_DESCARGA_MS = 15_000;

function aFoto(f: FotoBancoDb): FotoBanco {
  return {
    id: f.id,
    url: f.url,
    fuente: f.fuente,
    estado: f.estado,
    etiquetas: f.etiquetas,
    titulo: f.titulo,
    autor: f.autor,
    licencia: f.licencia,
    origenUrl: f.origenUrl,
    subidaPorId: f.subidaPorId,
    creadaEn: f.creadaEn.toISOString(),
  };
}

export function esCurador(usuario: Usuario): boolean {
  return usuario.esAdmin || usuario.esTester;
}

// Pura: qué fuentes ve cada usuario (tabla "Quién ve qué").
export function fuentesVisibles(usuario: Usuario, plan: Plan | null): Fuente[] {
  if (esCurador(usuario)) return ["web", "curado", "subidas", "propias"];
  if (plan === "premium") return ["curado", "subidas", "propias"];
  return ["curado"];
}

function normalizarTexto(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim().replace(/\s+/g, " ");
}

// Pura: minúsculas sin tildes, sin repetidas, 1–40 caracteres, máximo 20.
export function normalizarEtiquetas(etiquetas: unknown): string[] {
  const invalidas = () =>
    new AppError(
      "ETIQUETAS_INVALIDAS",
      `Poné entre 1 y ${MAX_ETIQUETAS} etiquetas de hasta ${MAX_LARGO_ETIQUETA} caracteres.`
    );
  if (!Array.isArray(etiquetas)) throw invalidas();
  const limpias = etiquetas.map((e) => (typeof e === "string" ? normalizarTexto(e) : ""));
  if (limpias.some((e) => e.length === 0 || e.length > MAX_LARGO_ETIQUETA)) throw invalidas();
  const unicas = [...new Set(limpias)];
  if (unicas.length === 0 || unicas.length > MAX_ETIQUETAS) throw invalidas();
  return unicas;
}

function soloCuradores(): AppError {
  return new AppError("SOLO_CURADORES", "Solo admins y testers pueden hacer esto.");
}

function fotoNoEncontrada(): AppError {
  return new AppError("FOTO_NO_ENCONTRADA", "La foto no existe.");
}

async function planDe(usuario: Usuario): Promise<Plan | null> {
  const tienda = await prisma.tienda.findUnique({ where: { vendedorId: usuario.id }, select: { plan: true } });
  return tienda?.plan ?? null;
}

// Condición SQL de visibilidad según las fuentes del usuario.
function condicionVisible(usuario: Usuario, fuentes: Fuente[]): Prisma.Sql {
  if (fuentes.includes("web")) return Prisma.sql`TRUE`; // curador: todo, en cualquier estado
  const partes: Prisma.Sql[] = [Prisma.sql`(f.fuente = 'web' AND f.estado = 'aprobada')`];
  if (fuentes.includes("subidas")) partes.push(Prisma.sql`(f.fuente = 'subida' AND f.estado = 'aprobada')`);
  if (fuentes.includes("propias")) partes.push(Prisma.sql`f.subida_por_id = ${usuario.id}`);
  return Prisma.sql`(${Prisma.join(partes, " OR ")})`;
}

// "tomates" → "tomat", "limones" → "limon", "papas" → "papa": raíz para LIKE.
function raiz(palabra: string): string {
  if (palabra.length > 5 && palabra.endsWith("es")) return palabra.slice(0, -2);
  if (palabra.length > 3 && palabra.endsWith("s")) return palabra.slice(0, -1);
  return palabra;
}

async function buscar(
  visible: Prisma.Sql,
  texto: string,
  page: number,
  pageSize: number
): Promise<{ data: FotoBanco[]; total: number }> {
  const raices = [...new Set(palabrasClave(texto).map(raiz))];
  // Puntaje = cantidad de palabras de la consulta que aparecen en alguna etiqueta o
  // en el título. Sin palabras, se lista todo lo visible.
  const puntaje =
    raices.length === 0
      ? Prisma.sql`1`
      : Prisma.sql`(SELECT COUNT(*) FROM unnest(${raices}::text[]) AS w
          WHERE EXISTS (SELECT 1 FROM unnest(f.etiquetas) AS e WHERE e LIKE '%' || w || '%')
             OR lower(coalesce(f.titulo, '')) LIKE '%' || w || '%')`;

  const filas = await prisma.$queryRaw<Array<{ id: string; puntaje: bigint; total: bigint }>>`
    SELECT id, puntaje, COUNT(*) OVER () AS total FROM (
      SELECT f.id, f.creada_en, ${puntaje} AS puntaje
      FROM fotos_banco f
      WHERE ${visible}
    ) AS s
    WHERE puntaje > 0
    ORDER BY puntaje DESC, creada_en DESC
    LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
  `;
  if (filas.length === 0) return { data: [], total: 0 };

  const fotos = await prisma.fotoBanco.findMany({ where: { id: { in: filas.map((f) => f.id) } } });
  const porId = new Map(fotos.map((f) => [f.id, f]));
  return { data: filas.map((f) => aFoto(porId.get(f.id)!)), total: Number(filas[0].total) };
}

export async function buscarEnBanco(
  usuario: Usuario,
  q: string,
  paginacion: { page?: number; pageSize?: number }
): Promise<{ data: FotoBanco[]; page: number; pageSize: number; total: number }> {
  const page = paginacion.page && paginacion.page > 0 ? paginacion.page : 1;
  const pageSize =
    paginacion.pageSize && paginacion.pageSize > 0 ? Math.min(paginacion.pageSize, PAGE_SIZE_MAXIMO) : PAGE_SIZE_DEFAULT;
  const fuentes = fuentesVisibles(usuario, await planDe(usuario));
  const { data, total } = await buscar(condicionVisible(usuario, fuentes), q, page, pageSize);
  return { data, page, pageSize, total };
}

// Para el seed: la mejor foto aprobada (cualquier fuente) para un nombre de producto.
export async function mejorFotoDelBanco(texto: string): Promise<FotoBanco | null> {
  if (palabrasClave(texto).length === 0) return null;
  const { data } = await buscar(Prisma.sql`f.estado = 'aprobada'`, texto, 1, 1);
  return data[0] ?? null;
}

async function descargar(url: string, hacerFetch: typeof fetch): Promise<{ contentType: string; buffer: Buffer }> {
  const invalida = () => new AppError("FOTO_INVALIDA", "No se pudo descargar la foto o no es una imagen válida.");
  let respuesta: Response;
  try {
    respuesta = await hacerFetch(url, { signal: AbortSignal.timeout(TIMEOUT_DESCARGA_MS) });
  } catch {
    throw invalida();
  }
  if (!respuesta.ok) throw invalida();
  const contentType = (respuesta.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  const buffer = Buffer.from(await respuesta.arrayBuffer());
  try {
    validarImagen(contentType, buffer.byteLength);
  } catch {
    throw invalida();
  }
  return { contentType, buffer };
}

// Guarda (o actualiza, por origenUrl) una foto web en el banco. Sin chequeo de
// permisos: lo usan aprobarFotoWeb (curadores) y el seed (como pendiente).
export async function guardarFotoWeb(
  resultado: ResultadoWeb,
  etiquetasInput: string[],
  opciones: { estado: "aprobada" | "pendiente"; revisadaPorId?: string; fetch?: typeof fetch }
): Promise<FotoBanco> {
  const etiquetas = normalizarEtiquetas(etiquetasInput);
  const revision =
    opciones.estado === "aprobada" ? { revisadaPorId: opciones.revisadaPorId ?? null, revisadaEn: new Date() } : {};

  const existente = await prisma.fotoBanco.findUnique({ where: { origenUrl: resultado.origenUrl } });
  if (existente) {
    const actualizada = await prisma.fotoBanco.update({
      where: { id: existente.id },
      data: {
        etiquetas: [...new Set([...existente.etiquetas, ...etiquetas])],
        ...(opciones.estado === "aprobada" && existente.estado !== "aprobada" ? { estado: "aprobada", ...revision } : {}),
      },
    });
    return aFoto(actualizada);
  }

  const archivo = await descargar(resultado.imagenUrl, opciones.fetch ?? fetch);
  const id = crypto.randomUUID();
  const { url } = await subirArchivo({ tipo: "bancofotos", entidadId: id, ...archivo });
  const creada = await prisma.fotoBanco.create({
    data: {
      id,
      url,
      fuente: "web",
      estado: opciones.estado,
      etiquetas,
      titulo: resultado.titulo,
      autor: resultado.autor,
      licencia: resultado.licencia,
      origenUrl: resultado.origenUrl,
      ...revision,
    },
  });
  return aFoto(creada);
}

export async function aprobarFotoWeb(
  curador: Usuario,
  resultado: ResultadoWeb,
  etiquetas: string[],
  opciones: { fetch?: typeof fetch } = {}
): Promise<FotoBanco> {
  if (!esCurador(curador)) throw soloCuradores();
  return guardarFotoWeb(resultado, etiquetas, { estado: "aprobada", revisadaPorId: curador.id, fetch: opciones.fetch });
}

export async function subirFotoBanco(
  usuario: Usuario,
  archivo: { contentType: string; buffer: Buffer },
  etiquetasInput: string[]
): Promise<FotoBanco> {
  const curador = esCurador(usuario);
  if (!curador && (await planDe(usuario)) !== "premium") {
    throw new AppError("FOTOS_SOLO_PREMIUM", "Subir fotos al banco es una función del plan premium.");
  }
  const etiquetas = normalizarEtiquetas(etiquetasInput);
  const id = crypto.randomUUID();
  const { url } = await subirArchivo({ tipo: "bancofotos", entidadId: id, ...archivo });
  const creada = await prisma.fotoBanco.create({
    data: {
      id,
      url,
      fuente: "subida",
      estado: curador ? "aprobada" : "pendiente",
      etiquetas,
      licencia: "propia",
      subidaPorId: usuario.id,
      ...(curador ? { revisadaPorId: usuario.id, revisadaEn: new Date() } : {}),
    },
  });
  return aFoto(creada);
}

export async function revisarFoto(
  curador: Usuario,
  fotoId: string,
  cambios: { estado?: "aprobada" | "rechazada"; etiquetas?: string[] }
): Promise<FotoBanco> {
  if (!esCurador(curador)) throw soloCuradores();
  if (cambios.estado !== undefined && cambios.estado !== "aprobada" && cambios.estado !== "rechazada") {
    throw new AppError("ESTADO_FOTO_INVALIDO", "El estado tiene que ser 'aprobada' o 'rechazada'.");
  }
  const etiquetas = cambios.etiquetas !== undefined ? normalizarEtiquetas(cambios.etiquetas) : undefined;
  const existente = await prisma.fotoBanco.findUnique({ where: { id: fotoId } });
  if (!existente) throw fotoNoEncontrada();

  const actualizada = await prisma.fotoBanco.update({
    where: { id: fotoId },
    data: {
      etiquetas,
      ...(cambios.estado ? { estado: cambios.estado, revisadaPorId: curador.id, revisadaEn: new Date() } : {}),
    },
  });
  return aFoto(actualizada);
}

async function fotoVisible(usuario: Usuario, fotoId: string): Promise<FotoBanco> {
  const fuentes = fuentesVisibles(usuario, await planDe(usuario));
  const filas = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT f.id FROM fotos_banco f WHERE f.id = ${fotoId} AND ${condicionVisible(usuario, fuentes)}
  `;
  if (filas.length === 0) throw fotoNoEncontrada();
  return aFoto(await prisma.fotoBanco.findUniqueOrThrow({ where: { id: fotoId } }));
}

export async function usarFoto(
  usuario: Usuario,
  fotoId: string,
  destino: { catalogoId: string } | { productoId: string }
): Promise<{ imagenUrl: string }> {
  const catalogoId = "catalogoId" in destino && typeof destino.catalogoId === "string" ? destino.catalogoId : null;
  const productoId = "productoId" in destino && typeof destino.productoId === "string" ? destino.productoId : null;
  if (!catalogoId && !productoId) {
    throw new AppError("DESTINO_INVALIDO", "Indicá catalogoId o productoId.");
  }
  const foto = await fotoVisible(usuario, fotoId);

  if (productoId) {
    // Foto personalizada del producto: mismas reglas que 03-productos.md (dueño + premium).
    await actualizarProducto(usuario, productoId, { imagenUrl: foto.url });
    return { imagenUrl: foto.url };
  }

  const entrada = await prisma.productoCatalogo.findUnique({ where: { id: catalogoId! } });
  if (!entrada) throw new AppError("CATALOGO_NO_ENCONTRADO", "El producto de catálogo no existe.");
  const tienda = await prisma.tienda.findUnique({ where: { vendedorId: usuario.id }, select: { id: true } });
  if (!usuario.esAdmin) {
    if (!usuario.esTester && !tienda) {
      throw new AppError("FORBIDDEN", "Solo vendedores y curadores pueden asignar fotos del catálogo.");
    }
    if (entrada.imagenUrl) {
      throw new AppError("CATALOGO_YA_TIENE_FOTO", "Este producto ya tiene foto en el catálogo.");
    }
  }
  await prisma.productoCatalogo.update({ where: { id: entrada.id }, data: { imagenUrl: foto.url } });
  // foto_cargada es para vendedores (12-gamificacion.md); un admin no suma.
  if (tienda && !usuario.esAdmin) {
    await sinRomper(() => otorgarPorFotoCargada(usuario.id, tienda.id, entrada.id));
  }
  return { imagenUrl: foto.url };
}
