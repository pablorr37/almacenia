import { prisma } from "@/lib/prisma";
import { diaLocal } from "@/lib/gamificacion/gamificacion";
import type { AccionPedido } from "@/lib/pedidos/pedidos";
import { destinatariosPedidos, notificar } from "./notificar";

// Disparadores de 22-notificaciones.md. Los llama la lógica de negocio dentro de
// sinRomper: nunca hacen fallar la operación.

function pesos(monto: number): string {
  return monto.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 2 });
}

async function cargarPedido(pedidoId: string) {
  return prisma.pedido.findUnique({
    where: { id: pedidoId },
    include: {
      items: { select: { cantidad: true, precioUnitario: true } },
      tienda: { select: { id: true, nombre: true } },
      comprador: { select: { id: true, nombre: true } },
    },
  });
}

export async function notificarPedidoNuevo(pedidoId: string): Promise<void> {
  const p = await cargarPedido(pedidoId);
  if (!p) return;
  const total = p.items.reduce((s, i) => s + Number(i.cantidad) * Number(i.precioUnitario), 0);
  await notificar(await destinatariosPedidos(p.tiendaId), {
    tipo: "pedido_nuevo",
    titulo: `Nuevo pedido de ${p.comprador.nombre}`,
    cuerpo: `${p.tienda.nombre}: ${p.items.length} ${p.items.length === 1 ? "producto" : "productos"} por ${pesos(total)}.`,
    url: `/pedidos/${p.id}`,
    tiendaId: p.tiendaId,
  });
}

const TEXTO_ESTADO: Partial<Record<AccionPedido, { titulo: string; cuerpo: string }>> = {
  confirmar: { titulo: "Confirmaron tu pedido", cuerpo: "La tienda lo está preparando." },
  rechazar: { titulo: "Rechazaron tu pedido", cuerpo: "La tienda no puede prepararlo." },
  marcarListo: { titulo: "Tu pedido está listo", cuerpo: "Ya podés pasar a retirarlo." },
  entregar: { titulo: "Pedido entregado", cuerpo: "¡Gracias por tu compra!" },
};

const ACCION_EN_PASADO: Record<AccionPedido, string> = {
  confirmar: "confirmó",
  rechazar: "rechazó",
  marcarListo: "marcó como listo",
  entregar: "entregó",
  cancelar: "canceló",
};

export async function notificarCambioPedido(pedidoId: string, actorId: string, accion: AccionPedido): Promise<void> {
  const p = await cargarPedido(pedidoId);
  if (!p) return;
  const url = `/pedidos/${p.id}`;
  if (accion === "cancelar") {
    await notificar(await destinatariosPedidos(p.tiendaId), {
      tipo: "pedido_cancelado",
      titulo: `${p.comprador.nombre} canceló su pedido`,
      cuerpo: `${p.tienda.nombre}: el pedido ya no hay que prepararlo.`,
      url,
      tiendaId: p.tiendaId,
    });
    return;
  }
  const texto = TEXTO_ESTADO[accion];
  if (texto) {
    await notificar([p.compradorId], { tipo: "pedido_estado", titulo: texto.titulo, cuerpo: `${p.tienda.nombre}: ${texto.cuerpo}`, url, tiendaId: p.tiendaId });
  }
  const actor = await prisma.usuario.findUnique({ where: { id: actorId }, select: { nombre: true } });
  await notificar(await destinatariosPedidos(p.tiendaId, actorId), {
    tipo: "pedido_modificado",
    titulo: `${actor?.nombre ?? "Alguien del equipo"} ${ACCION_EN_PASADO[accion]} un pedido`,
    cuerpo: `Pedido de ${p.comprador.nombre} en ${p.tienda.nombre}.`,
    url,
    tiendaId: p.tiendaId,
  });
}

// Oferta nueva o cambiada: a compradores (opt-in) que ya compraron, hicieron
// check-in o visitaron la página de la tienda. Una por tienda y día.
export async function notificarOferta(productoId: string, ahora = new Date()): Promise<number> {
  const producto = await prisma.producto.findUnique({
    where: { id: productoId },
    select: {
      nombre: true,
      precio: true,
      precioOferta: true,
      tienda: { select: { id: true, nombre: true, vendedorId: true, miembros: { select: { usuarioId: true } } } },
    },
  });
  if (!producto || producto.precioOferta === null || Number(producto.precioOferta) >= Number(producto.precio)) return 0;
  const tiendaId = producto.tienda.id;
  const equipo = new Set([producto.tienda.vendedorId, ...producto.tienda.miembros.map((m) => m.usuarioId)]);
  const [ventas, checkIns, visitas] = await Promise.all([
    prisma.venta.findMany({ where: { tiendaId, compradorId: { not: null } }, select: { compradorId: true }, distinct: ["compradorId"] }),
    prisma.checkInTienda.findMany({ where: { tiendaId }, select: { compradorId: true }, distinct: ["compradorId"] }),
    prisma.visitaPaginaTienda.findMany({ where: { tiendaId }, select: { compradorId: true } }),
  ]);
  const ids = [...new Set([...ventas.map((v) => v.compradorId!), ...checkIns.map((c) => c.compradorId), ...visitas.map((v) => v.compradorId)])].filter(
    (id) => !equipo.has(id)
  );
  const r = await notificar(ids, {
    tipo: "oferta",
    titulo: `Oferta en ${producto.tienda.nombre}`,
    cuerpo: `${producto.nombre}: ${pesos(Number(producto.precioOferta))} (antes ${pesos(Number(producto.precio))}).`,
    url: `/tiendas/${tiendaId}`,
    tiendaId,
    claveUnica: `oferta:${tiendaId}:${diaLocal(ahora)}`,
  });
  return r.guardadas;
}
