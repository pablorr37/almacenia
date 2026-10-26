import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import type { Usuario } from "@/lib/auth/auth";
import { accesoATienda } from "@/lib/equipo/equipo";
import { sinRomper } from "@/lib/gamificacion/gamificacion";
import { estadoApertura } from "@/lib/tiendas/horarios";
import { notificar, destinatariosPedidos } from "@/lib/notificaciones/notificar";
import { PLANTILLAS, TEXTO_MAXIMO_CHAT, plantillasDe, type Plantilla } from "./plantillas";

// Chat entre comprador y tienda (24-chat.md).

export { PLANTILLAS } from "./plantillas";

const DIAS_CHAT_LIBRE = 60; // 2 meses desde la última compra
const DIA_MS = 24 * 60 * 60 * 1000;
const ULTIMOS_MENSAJES = 100;

export interface Mensaje {
  id: string;
  deTienda: boolean;
  autor: { id: string; nombre: string } | null;
  texto: string;
  plantilla: string | null;
  pedidoId: string | null;
  leido: boolean;
  creadoEn: string;
}

export interface ConversacionResumen {
  id: string;
  tiendaId: string;
  compradorId: string;
  otraParte: { id: string; nombre: string };
  ultimoMensaje: { texto: string; creadoEn: string; deTienda: boolean } | null;
  noLeidos: number;
}

export interface ConversacionDetalle extends ConversacionResumen {
  lado: "comprador" | "tienda";
  libre: boolean;
  motivo: string | null;
  plantillas: Array<{ clave: Plantilla; texto: string }>;
  mensajes: Mensaje[];
}

// ¿Se puede escribir libremente? (24-chat.md, "Texto libre")
export async function chatLibre(compradorId: string, tiendaId: string, ahora = new Date()): Promise<{ libre: boolean; motivo: string | null }> {
  const [comprador, tienda] = await Promise.all([
    prisma.usuario.findUnique({ where: { id: compradorId }, select: { plan: true } }),
    prisma.tienda.findUnique({ where: { id: tiendaId }, select: { plan: true } }),
  ]);
  if ((comprador && comprador.plan !== "free") || (tienda && tienda.plan !== "free")) return { libre: true, motivo: null };
  const [compraReciente, pedidoAbierto] = await Promise.all([
    prisma.venta.findFirst({
      where: { compradorId, tiendaId, estado: "cobrada", creadaEn: { gte: new Date(ahora.getTime() - DIAS_CHAT_LIBRE * DIA_MS) } },
      select: { id: true },
    }),
    prisma.pedido.findFirst({
      where: { compradorId, tiendaId, estado: { in: ["pendiente", "confirmado", "listo_para_retirar"] } },
      select: { id: true },
    }),
  ]);
  if (compraReciente || pedidoAbierto) return { libre: true, motivo: null };
  return {
    libre: false,
    motivo: "Para escribir mensajes tenés que haber comprado en esta tienda en los últimos 2 meses o tener un pedido en curso (o plan Premium). Mientras tanto, podés preguntar si está abierta.",
  };
}

async function exigirParticipante(usuario: Usuario, conversacionId: string) {
  const c = await prisma.conversacion.findUnique({ where: { id: conversacionId } });
  if (!c) throw new AppError("CONVERSACION_NO_ENCONTRADA", "La conversación no existe.");
  if (c.compradorId === usuario.id) return { c, lado: "comprador" as const };
  const acceso = await accesoATienda(usuario.id, c.tiendaId);
  if (acceso?.permisos.includes("pedidos")) return { c, lado: "tienda" as const };
  throw new AppError("CONVERSACION_NO_ENCONTRADA", "La conversación no existe.");
}

async function obtenerOCrear(tiendaId: string, compradorId: string) {
  return prisma.conversacion.upsert({
    where: { tiendaId_compradorId: { tiendaId, compradorId } },
    create: { tiendaId, compradorId },
    update: {},
  });
}

export async function abrirConversacion(usuario: Usuario, tiendaId: string): Promise<{ id: string }> {
  const tienda = await prisma.tienda.findUnique({ where: { id: tiendaId }, select: { id: true } });
  if (!tienda) throw new AppError("TIENDA_NO_ENCONTRADA", "La tienda no existe.");
  if (await accesoATienda(usuario.id, tiendaId)) {
    throw new AppError("CHAT_TIENDA_PROPIA", "No podés abrir un chat con tu propia tienda.");
  }
  const c = await obtenerOCrear(tiendaId, usuario.id);
  return { id: c.id };
}

type FilaMensaje = { id: string; deTienda: boolean; texto: string; plantilla: string | null; pedidoId: string | null; leidoEn: Date | null; creadoEn: Date; autor: { id: string; nombre: string } | null };

function aMensaje(m: FilaMensaje): Mensaje {
  return { id: m.id, deTienda: m.deTienda, autor: m.autor, texto: m.texto, plantilla: m.plantilla, pedidoId: m.pedidoId, leido: m.leidoEn !== null, creadoEn: m.creadoEn.toISOString() };
}

async function resumen(c: { id: string; tiendaId: string; compradorId: string }, lado: "comprador" | "tienda"): Promise<ConversacionResumen> {
  const [otra, ultimo, noLeidos] = await Promise.all([
    lado === "comprador"
      ? prisma.tienda.findUniqueOrThrow({ where: { id: c.tiendaId }, select: { id: true, nombre: true } })
      : prisma.usuario.findUniqueOrThrow({ where: { id: c.compradorId }, select: { id: true, nombre: true } }),
    prisma.mensaje.findFirst({ where: { conversacionId: c.id }, orderBy: { creadoEn: "desc" } }),
    // No leídos: los de la otra parte.
    prisma.mensaje.count({ where: { conversacionId: c.id, leidoEn: null, deTienda: lado === "comprador" } }),
  ]);
  return {
    id: c.id,
    tiendaId: c.tiendaId,
    compradorId: c.compradorId,
    otraParte: otra,
    ultimoMensaje: ultimo ? { texto: ultimo.texto, creadoEn: ultimo.creadoEn.toISOString(), deTienda: ultimo.deTienda } : null,
    noLeidos,
  };
}

export async function obtenerConversacion(usuario: Usuario, id: string, ahora = new Date()): Promise<ConversacionDetalle> {
  const { c, lado } = await exigirParticipante(usuario, id);
  const r = await resumen(c, lado);
  const { libre, motivo } = await chatLibre(c.compradorId, c.tiendaId, ahora);
  const filas = await prisma.mensaje.findMany({
    where: { conversacionId: id },
    include: { autor: { select: { id: true, nombre: true } } },
    orderBy: { creadoEn: "desc" },
    take: ULTIMOS_MENSAJES,
  });
  await prisma.mensaje.updateMany({ where: { conversacionId: id, leidoEn: null, deTienda: lado === "comprador" }, data: { leidoEn: ahora } });
  return { ...r, noLeidos: 0, lado, libre, motivo, plantillas: plantillasDe(lado), mensajes: filas.reverse().map(aMensaje) };
}

export async function listarConversaciones(usuario: Usuario, tiendaId?: string): Promise<ConversacionResumen[]> {
  let filas;
  let lado: "comprador" | "tienda";
  if (tiendaId) {
    const acceso = await accesoATienda(usuario.id, tiendaId);
    if (!acceso?.permisos.includes("pedidos")) throw new AppError("SIN_PERMISO", "No tenés permiso para ver los chats de esta tienda.");
    filas = await prisma.conversacion.findMany({ where: { tiendaId }, orderBy: { ultimoMensajeEn: "desc" }, take: 100 });
    lado = "tienda";
  } else {
    filas = await prisma.conversacion.findMany({ where: { compradorId: usuario.id }, orderBy: { ultimoMensajeEn: "desc" }, take: 100 });
    lado = "comprador";
  }
  return Promise.all(filas.map((c) => resumen(c, lado)));
}

// Notificación de un mensaje nuevo (24-chat.md, "Notificaciones").
async function notificarMensaje(c: { id: string; tiendaId: string; compradorId: string }, deTienda: boolean, texto: string, ahora: Date) {
  const tienda = await prisma.tienda.findUniqueOrThrow({
    where: { id: c.tiendaId },
    select: { nombre: true, abierto24hs: true, chatNotifFueraHorario: true, horarios: { select: { diaSemana: true, abre: true, cierra: true } } },
  });
  const cuerpo = texto.length > 120 ? `${texto.slice(0, 117)}…` : texto;
  if (deTienda) {
    await notificar([c.compradorId], { tipo: "mensaje_chat", titulo: tienda.nombre, cuerpo, url: `/chat/${c.id}`, tiendaId: c.tiendaId });
    return;
  }
  const apertura = estadoApertura(tienda.horarios, ahora, { abierto24hs: tienda.abierto24hs });
  if (apertura.estado === "cerrada" && !tienda.chatNotifFueraHorario) return;
  const comprador = await prisma.usuario.findUnique({ where: { id: c.compradorId }, select: { nombre: true } });
  await notificar(await destinatariosPedidos(c.tiendaId), {
    tipo: "mensaje_chat",
    titulo: `${comprador?.nombre ?? "Un cliente"} escribió a ${tienda.nombre}`,
    cuerpo,
    url: `/chat/${c.id}`,
    tiendaId: c.tiendaId,
  });
}

export async function enviarMensaje(
  usuario: Usuario,
  conversacionId: string,
  input: { texto?: string; plantilla?: Plantilla },
  ahora = new Date()
): Promise<Mensaje> {
  const { c, lado } = await exigirParticipante(usuario, conversacionId);
  let texto: string;
  let plantilla: Plantilla | null = null;
  if (input.plantilla !== undefined) {
    const p = PLANTILLAS[input.plantilla as Plantilla];
    if (!p || p.de !== lado) throw new AppError("PLANTILLA_INVALIDA", "Ese mensaje rápido no está disponible.");
    texto = p.texto;
    plantilla = input.plantilla;
  } else {
    texto = typeof input.texto === "string" ? input.texto.trim() : "";
    if (!texto || texto.length > TEXTO_MAXIMO_CHAT) {
      throw new AppError("MENSAJE_INVALIDO", `El mensaje tiene que tener entre 1 y ${TEXTO_MAXIMO_CHAT} caracteres.`);
    }
    const { libre, motivo } = await chatLibre(c.compradorId, c.tiendaId, ahora);
    if (!libre) throw new AppError("CHAT_SOLO_BOTONES", motivo ?? "Por ahora solo podés usar los mensajes rápidos.");
  }
  const m = await prisma.mensaje.create({
    data: { conversacionId, autorId: usuario.id, deTienda: lado === "tienda", texto, plantilla, creadoEn: ahora },
    include: { autor: { select: { id: true, nombre: true } } },
  });
  await prisma.conversacion.update({ where: { id: conversacionId }, data: { ultimoMensajeEn: ahora } });
  await sinRomper(() => notificarMensaje(c, lado === "tienda", texto, ahora));
  return aMensaje(m);
}

// Constancia de un paso de un ajuste de peso (04-pedidos.md). No notifica: el ajuste
// ya avisa por su cuenta.
export async function mensajeDeSistema(pedido: { id: string; tiendaId: string; compradorId: string }, texto: string, deTienda: boolean, autorId: string): Promise<void> {
  const c = await obtenerOCrear(pedido.tiendaId, pedido.compradorId);
  await prisma.mensaje.create({ data: { conversacionId: c.id, autorId, deTienda, texto, plantilla: "ajuste", pedidoId: pedido.id } });
  await prisma.conversacion.update({ where: { id: c.id }, data: { ultimoMensajeEn: new Date() } });
}
