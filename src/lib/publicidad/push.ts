import { prisma } from "@/lib/prisma";
import { obtenerConfig } from "@/lib/config/config";
import { diaLocal } from "@/lib/gamificacion/gamificacion";
import { notificar } from "@/lib/notificaciones/notificar";
import { dentroDeFranja } from "@/lib/notificaciones/horario";
import { fechaDb } from "./campanias";

// Publicidad push (21-publicidad.md / 22-notificaciones.md): solo free con opt-in,
// fuera del equipo de la tienda, dentro de la franja horaria y con tope semanal.

const SEMANA_MS = 7 * 24 * 60 * 60 * 1000;

export async function procesarPublicidadPush(ahora = new Date()): Promise<{ campanias: number; enviados: number }> {
  const [inicio, fin, tope] = await Promise.all([
    obtenerConfig("notif.hora_inicio"),
    obtenerConfig("notif.hora_fin"),
    obtenerConfig("notif.publicidad_push_semana"),
  ]);
  if (!dentroDeFranja(ahora, inicio, fin)) return { campanias: 0, enviados: 0 };

  const hoy = diaLocal(ahora);
  const campanias = await prisma.campaniaAviso.findMany({
    where: { espacio: "push", estado: "activa", enviadaEn: null, desde: { lte: fechaDb(hoy) } },
    include: {
      piezas: true,
      tienda: { select: { id: true, nombre: true, vendedorId: true, miembros: { select: { usuarioId: true } } } },
    },
    orderBy: { aprobadaEn: "asc" },
  });

  let enviados = 0;
  for (const c of campanias) {
    // Se marca primero: si otra corrida la toma a la vez, solo una envía.
    const { count } = await prisma.campaniaAviso.updateMany({
      where: { id: c.id, enviadaEn: null, estado: "activa" },
      data: { enviadaEn: ahora, estado: "finalizada", finalizadaEn: ahora, diasConsumidos: 1, ultimoDiaConsumido: fechaDb(hoy) },
    });
    if (count === 0) continue;

    const equipo = [c.tienda.vendedorId, ...c.tienda.miembros.map((m) => m.usuarioId)];
    const candidatos = await prisma.usuario.findMany({
      where: {
        id: { notIn: equipo },
        estadoCuenta: "activa",
        plan: "free",
        preferenciasNotif: { some: { categoria: "publicidad", OR: [{ enApp: true }, { push: true }, { email: true }] } },
      },
      select: { id: true },
    });
    const recibidas = await prisma.notificacion.groupBy({
      by: ["usuarioId"],
      where: { tipo: "publicidad", creadaEn: { gte: new Date(ahora.getTime() - SEMANA_MS) }, usuarioId: { in: candidatos.map((u) => u.id) } },
      _count: { _all: true },
    });
    const porUsuario = new Map(recibidas.map((r) => [r.usuarioId, r._count._all]));
    const destinatarios = candidatos.map((u) => u.id).filter((id) => (porUsuario.get(id) ?? 0) < tope);

    const pieza = c.piezas[0];
    const r = await notificar(destinatarios, {
      tipo: "publicidad",
      titulo: c.tienda.nombre,
      cuerpo: pieza?.texto ?? c.titulo,
      url: pieza?.destino?.startsWith("/") ? pieza.destino : `/tiendas/${c.tienda.id}`,
      tiendaId: c.tienda.id,
      claveUnica: `publicidad:${c.id}`,
    });
    enviados += r.guardadas;
  }
  return { campanias: campanias.length, enviados };
}
