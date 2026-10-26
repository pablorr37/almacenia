import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import type { Usuario } from "@/lib/auth/auth";
import { CATEGORIAS, PREFERENCIA_POR_DEFECTO, esCategoria, type Categoria } from "./catalogo";

// Centro de notificaciones, preferencias y suscripciones push (22-notificaciones.md).

const PAGE_SIZE_DEFAULT = 20;
const PAGE_SIZE_MAXIMO = 100;

export interface Notificacion {
  id: string;
  tipo: string;
  titulo: string;
  cuerpo: string;
  url: string | null;
  tiendaId: string | null;
  leida: boolean;
  creadaEn: string;
}

export interface Preferencia {
  categoria: Categoria;
  enApp: boolean;
  push: boolean;
  email: boolean;
}

export async function listarNotificaciones(
  usuario: Usuario,
  paginacion: { page?: number; pageSize?: number }
): Promise<{ data: Notificacion[]; page: number; pageSize: number; total: number }> {
  const page = paginacion.page && paginacion.page > 0 ? paginacion.page : 1;
  const pageSize =
    paginacion.pageSize && paginacion.pageSize > 0 ? Math.min(paginacion.pageSize, PAGE_SIZE_MAXIMO) : PAGE_SIZE_DEFAULT;
  const where = { usuarioId: usuario.id, enApp: true };
  const [filas, total] = await Promise.all([
    prisma.notificacion.findMany({ where, orderBy: { creadaEn: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.notificacion.count({ where }),
  ]);
  return {
    data: filas.map((n) => ({
      id: n.id,
      tipo: n.tipo,
      titulo: n.titulo,
      cuerpo: n.cuerpo,
      url: n.url,
      tiendaId: n.tiendaId,
      leida: n.leidaEn !== null,
      creadaEn: n.creadaEn.toISOString(),
    })),
    page,
    pageSize,
    total,
  };
}

export async function contarNoLeidas(usuario: Usuario): Promise<number> {
  return prisma.notificacion.count({ where: { usuarioId: usuario.id, enApp: true, leidaEn: null } });
}

export async function marcarLeida(usuario: Usuario, id: string): Promise<void> {
  const { count } = await prisma.notificacion.updateMany({
    where: { id, usuarioId: usuario.id },
    data: { leidaEn: new Date() },
  });
  if (count === 0) throw new AppError("NOTIFICACION_NO_ENCONTRADA", "La notificación no existe.");
}

export async function marcarTodasLeidas(usuario: Usuario): Promise<void> {
  await prisma.notificacion.updateMany({ where: { usuarioId: usuario.id, leidaEn: null }, data: { leidaEn: new Date() } });
}

export async function obtenerPreferencias(usuario: Usuario): Promise<Preferencia[]> {
  const filas = await prisma.preferenciaNotificacion.findMany({ where: { usuarioId: usuario.id } });
  const porCategoria = new Map(filas.map((f) => [f.categoria, f]));
  return CATEGORIAS.map((categoria) => {
    const f = porCategoria.get(categoria) ?? PREFERENCIA_POR_DEFECTO[categoria];
    return { categoria, enApp: f.enApp, push: f.push, email: f.email };
  });
}

export async function guardarPreferencia(usuario: Usuario, p: Preferencia): Promise<Preferencia> {
  if (!esCategoria(p.categoria)) throw new AppError("CATEGORIA_INVALIDA", "Esa categoría de notificaciones no existe.");
  const datos = { enApp: p.enApp === true, push: p.push === true, email: p.email === true };
  await prisma.preferenciaNotificacion.upsert({
    where: { usuarioId_categoria: { usuarioId: usuario.id, categoria: p.categoria } },
    create: { usuarioId: usuario.id, categoria: p.categoria, ...datos },
    update: datos,
  });
  return { categoria: p.categoria, ...datos };
}

export interface SuscripcionInput {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
}

export async function guardarSuscripcion(usuario: Usuario, sub: SuscripcionInput, userAgent?: string | null): Promise<void> {
  const endpoint = typeof sub?.endpoint === "string" ? sub.endpoint : "";
  const p256dh = sub?.keys?.p256dh;
  const auth = sub?.keys?.auth;
  if (!endpoint.startsWith("https://") || typeof p256dh !== "string" || !p256dh || typeof auth !== "string" || !auth) {
    throw new AppError("SUSCRIPCION_INVALIDA", "La suscripción push no es válida.");
  }
  // El mismo navegador puede pasar a otra cuenta: el endpoint queda del usuario actual.
  await prisma.suscripcionPush.upsert({
    where: { endpoint },
    create: { usuarioId: usuario.id, endpoint, p256dh, auth, userAgent: userAgent ?? null },
    update: { usuarioId: usuario.id, p256dh, auth, userAgent: userAgent ?? null },
  });
}

export async function borrarSuscripcion(usuario: Usuario, endpoint: string): Promise<void> {
  await prisma.suscripcionPush.deleteMany({ where: { usuarioId: usuario.id, endpoint } });
}

// Pausa global (22-notificaciones.md): null la levanta.
export async function pausarNotificaciones(usuario: Usuario, hasta: Date | null): Promise<{ pausada: boolean; pausadasHasta: string | null }> {
  if (hasta !== null && (!(hasta instanceof Date) || Number.isNaN(hasta.getTime()) || hasta <= new Date())) {
    throw new AppError("PAUSA_INVALIDA", "La pausa tiene que terminar en el futuro.");
  }
  await prisma.usuario.update({ where: { id: usuario.id }, data: { notificacionesPausadasHasta: hasta } });
  return { pausada: hasta !== null, pausadasHasta: hasta?.toISOString() ?? null };
}

export async function estadoPausa(usuario: Usuario): Promise<{ pausada: boolean; pausadasHasta: string | null }> {
  const u = await prisma.usuario.findUnique({ where: { id: usuario.id }, select: { notificacionesPausadasHasta: true } });
  const hasta = u?.notificacionesPausadasHasta ?? null;
  return hasta && hasta > new Date() ? { pausada: true, pausadasHasta: hasta.toISOString() } : { pausada: false, pausadasHasta: null };
}
