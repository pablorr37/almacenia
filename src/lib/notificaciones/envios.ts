import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { requireAdmin, type Usuario } from "@/lib/auth/auth";
import type { EstadoEnvio, Plan, Prisma } from "@/generated-prisma/client";
import { notificar } from "./notificar";

// Envíos masivos del admin (22-notificaciones.md), procesados por lotes.

const TIPOS = ["aviso_interno", "general"] as const;
const PLANES: Plan[] = ["free", "premium", "plata"];
const ROLES = ["comprador", "vendedor"] as const;
const LOTE_DEFAULT = 500;

export interface Segmento {
  roles?: Array<(typeof ROLES)[number]>;
  planes?: Plan[];
  tiendaId?: string;
  usuarioIds?: string[]; // envío dirigido
}

export interface CrearEnvioInput {
  tipo: (typeof TIPOS)[number];
  titulo: string;
  cuerpo: string;
  url?: string | null;
  segmento: Segmento;
}

export interface Envio {
  id: string;
  tipo: string;
  titulo: string;
  cuerpo: string;
  url: string | null;
  segmento: Segmento;
  estado: EstadoEnvio;
  total: number;
  enviados: number;
  creadoEn: string;
  terminadoEn: string | null;
}

function aEnvio(e: Prisma.EnvioNotificacionGetPayload<object>): Envio {
  return {
    id: e.id,
    tipo: e.tipo,
    titulo: e.titulo,
    cuerpo: e.cuerpo,
    url: e.url,
    segmento: e.segmento as Segmento,
    estado: e.estado,
    total: e.total,
    enviados: e.enviados,
    creadoEn: e.creadoEn.toISOString(),
    terminadoEn: e.terminadoEn?.toISOString() ?? null,
  };
}

function validarSegmento(s: unknown): Segmento {
  const seg = (s ?? {}) as Segmento;
  if (typeof seg !== "object") throw new AppError("ENVIO_INVALIDO", "Segmento inválido.");
  if (seg.roles !== undefined && (!Array.isArray(seg.roles) || seg.roles.some((r) => !ROLES.includes(r)))) {
    throw new AppError("ENVIO_INVALIDO", "Rol inválido en el segmento.");
  }
  if (seg.planes !== undefined && (!Array.isArray(seg.planes) || seg.planes.some((p) => !PLANES.includes(p)))) {
    throw new AppError("ENVIO_INVALIDO", "Plan inválido en el segmento.");
  }
  if (seg.tiendaId !== undefined && typeof seg.tiendaId !== "string") throw new AppError("ENVIO_INVALIDO", "Tienda inválida.");
  if (seg.usuarioIds !== undefined && (!Array.isArray(seg.usuarioIds) || seg.usuarioIds.some((id) => typeof id !== "string"))) {
    throw new AppError("ENVIO_INVALIDO", "Usuarios inválidos.");
  }
  return {
    ...(seg.roles?.length ? { roles: seg.roles } : {}),
    ...(seg.planes?.length ? { planes: seg.planes } : {}),
    ...(seg.tiendaId ? { tiendaId: seg.tiendaId } : {}),
    ...(seg.usuarioIds?.length ? { usuarioIds: seg.usuarioIds } : {}),
  };
}

function whereSegmento(seg: Segmento): Prisma.UsuarioWhereInput {
  const and: Prisma.UsuarioWhereInput[] = [{ estadoCuenta: "activa" }];
  if (seg.roles) {
    and.push({ OR: seg.roles.map((r) => (r === "comprador" ? { esComprador: true } : { esVendedor: true })) });
  }
  if (seg.planes) and.push({ plan: { in: seg.planes } });
  if (seg.tiendaId) and.push({ OR: [{ tiendas: { some: { id: seg.tiendaId } } }, { membresias: { some: { tiendaId: seg.tiendaId } } }] });
  if (seg.usuarioIds) and.push({ id: { in: seg.usuarioIds } });
  return { AND: and };
}

export async function contarSegmento(admin: Usuario, segmento: Segmento): Promise<number> {
  requireAdmin(admin);
  return prisma.usuario.count({ where: whereSegmento(validarSegmento(segmento)) });
}

// Procesa un lote de un envío; devuelve cuántos destinatarios cubrió.
async function procesarLote(envioId: string, lote: number): Promise<number> {
  const envio = await prisma.envioNotificacion.findUnique({ where: { id: envioId } });
  if (!envio || envio.estado !== "enviando") return 0;
  const usuarios = await prisma.usuario.findMany({
    where: { AND: [whereSegmento(envio.segmento as Segmento), ...(envio.ultimoUsuarioId ? [{ id: { gt: envio.ultimoUsuarioId } }] : [])] },
    select: { id: true },
    orderBy: { id: "asc" },
    take: lote,
  });
  if (usuarios.length > 0) {
    await notificar(
      usuarios.map((u) => u.id),
      { tipo: envio.tipo, titulo: envio.titulo, cuerpo: envio.cuerpo, url: envio.url ?? undefined, claveUnica: `envio:${envio.id}` }
    );
  }
  const terminado = usuarios.length < lote;
  await prisma.envioNotificacion.updateMany({
    where: { id: envioId, estado: "enviando" },
    data: {
      enviados: { increment: usuarios.length },
      ultimoUsuarioId: usuarios.at(-1)?.id ?? envio.ultimoUsuarioId,
      ...(terminado ? { estado: "enviado", terminadoEn: new Date() } : {}),
    },
  });
  return usuarios.length;
}

export async function crearEnvio(admin: Usuario, input: CrearEnvioInput, primerLote = LOTE_DEFAULT): Promise<Envio> {
  requireAdmin(admin);
  if (!TIPOS.includes(input.tipo)) throw new AppError("ENVIO_INVALIDO", "El tipo tiene que ser aviso_interno o general.");
  const titulo = typeof input.titulo === "string" ? input.titulo.trim() : "";
  const cuerpo = typeof input.cuerpo === "string" ? input.cuerpo.trim() : "";
  if (!titulo || titulo.length > 80) throw new AppError("ENVIO_INVALIDO", "El título es obligatorio (hasta 80 caracteres).");
  if (!cuerpo || cuerpo.length > 300) throw new AppError("ENVIO_INVALIDO", "El texto es obligatorio (hasta 300 caracteres).");
  const url = typeof input.url === "string" && input.url.trim() ? input.url.trim() : null;
  if (url && (!url.startsWith("/") || url.startsWith("//"))) throw new AppError("ENVIO_INVALIDO", "El enlace tiene que ser una página de Almacenia (/…).");
  const segmento = validarSegmento(input.segmento);
  const total = await prisma.usuario.count({ where: whereSegmento(segmento) });
  const envio = await prisma.envioNotificacion.create({
    data: { categoria: "avisos", tipo: input.tipo, titulo, cuerpo, url, segmento: segmento as Prisma.InputJsonValue, total, creadoPorId: admin.id },
  });
  await procesarLote(envio.id, primerLote);
  return aEnvio(await prisma.envioNotificacion.findUniqueOrThrow({ where: { id: envio.id } }));
}

export async function listarEnvios(admin: Usuario): Promise<Envio[]> {
  requireAdmin(admin);
  const filas = await prisma.envioNotificacion.findMany({ orderBy: { creadoEn: "desc" }, take: 50 });
  return filas.map(aEnvio);
}

export async function cancelarEnvio(admin: Usuario, id: string): Promise<Envio> {
  requireAdmin(admin);
  const existe = await prisma.envioNotificacion.findUnique({ where: { id } });
  if (!existe) throw new AppError("ENVIO_NO_ENCONTRADO", "El envío no existe.");
  const { count } = await prisma.envioNotificacion.updateMany({ where: { id, estado: "enviando" }, data: { estado: "cancelado", terminadoEn: new Date() } });
  if (count === 0) throw new AppError("TRANSICION_INVALIDA", "El envío ya terminó.");
  return aEnvio(await prisma.envioNotificacion.findUniqueOrThrow({ where: { id } }));
}

export async function procesarEnvios(lote = LOTE_DEFAULT): Promise<{ enviados: number }> {
  const pendientes = await prisma.envioNotificacion.findMany({ where: { estado: "enviando" }, select: { id: true }, orderBy: { creadoEn: "asc" } });
  let enviados = 0;
  for (const e of pendientes) {
    let n: number;
    do {
      n = await procesarLote(e.id, lote);
      enviados += n;
    } while (n === lote);
  }
  return { enviados };
}
