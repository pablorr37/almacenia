import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated-prisma/client";
import { canales } from "./canales";
import { categoriaDe, PREFERENCIA_POR_DEFECTO, PUSH_POR_CATEGORIA } from "./catalogo";

// Núcleo de 22-notificaciones.md: guarda, respeta preferencias y despacha a los canales.

export interface NuevaNotificacion {
  tipo: string;
  titulo: string;
  cuerpo: string;
  url?: string;
  tiendaId?: string;
  // Deduplicación: se guarda como `${claveUnica}:${usuarioId}`.
  claveUnica?: string;
}

function escaparHtml(texto: string): string {
  return texto.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function urlAbsoluta(url: string | undefined): string | null {
  const base = (process.env.APP_URL || process.env.AUTH_URL || "").replace(/\/$/, "");
  if (!url) return base || null;
  return base ? `${base}${url}` : null;
}

async function despachar(
  usuario: { id: string; email: string },
  n: NuevaNotificacion,
  canalesUsuario: { push: boolean; email: boolean }
): Promise<void> {
  const { push, email } = canales();
  if (canalesUsuario.push && push.habilitado()) {
    const subs = await prisma.suscripcionPush.findMany({ where: { usuarioId: usuario.id } });
    const payload = JSON.stringify({ title: n.titulo, body: n.cuerpo, url: n.url ?? "/" });
    for (const sub of subs) {
      try {
        if ((await push.enviar(sub, payload, PUSH_POR_CATEGORIA[categoriaDe(n.tipo)])) === "expirada") {
          await prisma.suscripcionPush.deleteMany({ where: { id: sub.id } });
        }
      } catch (error) {
        console.error("[notificaciones] push falló:", error);
      }
    }
  }
  if (canalesUsuario.email && email.habilitado()) {
    const enlace = urlAbsoluta(n.url);
    const texto = `${n.cuerpo}${enlace ? `\n\n${enlace}` : ""}\n\n— Almacenia`;
    const html = `<p>${escaparHtml(n.cuerpo)}</p>${enlace ? `<p><a href="${escaparHtml(enlace)}">Abrir en Almacenia</a></p>` : ""}<p style="color:#888">Podés cambiar qué avisos recibís desde tu perfil.</p>`;
    try {
      await email.enviar(usuario.email, n.titulo, texto, html);
    } catch (error) {
      console.error("[notificaciones] email falló:", error);
    }
  }
}

export async function notificar(usuarioIds: string[], n: NuevaNotificacion): Promise<{ guardadas: number }> {
  const ids = [...new Set(usuarioIds)];
  if (ids.length === 0) return { guardadas: 0 };
  const categoria = categoriaDe(n.tipo);
  const usuarios = await prisma.usuario.findMany({
    where: { id: { in: ids }, estadoCuenta: "activa" },
    select: { id: true, email: true, plan: true, notificacionesPausadasHasta: true, preferenciasNotif: { where: { categoria } } },
  });
  const ahora = new Date();

  let guardadas = 0;
  for (const u of usuarios) {
    // Premium y plata no reciben publicidad (21-publicidad.md).
    if (categoria === "publicidad" && u.plan !== "free") continue;
    const pref = u.preferenciasNotif[0] ?? PREFERENCIA_POR_DEFECTO[categoria];
    if (!pref.enApp && !pref.push && !pref.email) continue;
    try {
      await prisma.notificacion.create({
        data: {
          usuarioId: u.id,
          tipo: n.tipo,
          titulo: n.titulo,
          cuerpo: n.cuerpo,
          url: n.url ?? null,
          tiendaId: n.tiendaId ?? null,
          claveUnica: n.claveUnica ? `${n.claveUnica}:${u.id}` : null,
          enApp: pref.enApp,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") continue; // ya enviada
      throw error;
    }
    guardadas += 1;
    // Pausa (22-notificaciones.md): queda en la app, pero no sale por push ni email.
    const pausada = !!u.notificacionesPausadasHasta && u.notificacionesPausadasHasta > ahora;
    if (!pausada) await despachar(u, n, { push: pref.push, email: pref.email });
  }
  return { guardadas };
}

// Propietario y miembros con permiso `pedidos` (04-pedidos.md), menos `excepto`.
export async function destinatariosPedidos(tiendaId: string, excepto?: string): Promise<string[]> {
  const tienda = await prisma.tienda.findUnique({
    where: { id: tiendaId },
    select: { vendedorId: true, miembros: { where: { permisos: { has: "pedidos" } }, select: { usuarioId: true } } },
  });
  if (!tienda) return [];
  return [tienda.vendedorId, ...tienda.miembros.map((m) => m.usuarioId)].filter((id) => id !== excepto);
}
