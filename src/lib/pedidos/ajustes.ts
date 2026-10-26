import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import type { Usuario } from "@/lib/auth/auth";
import { accesoATienda } from "@/lib/equipo/equipo";
import { sinRomper } from "@/lib/gamificacion/gamificacion";
import { esCantidadValida, formatearCantidad, pesoPorImporte, redondearCantidad } from "@/lib/productos/unidades";
import { notificar, destinatariosPedidos } from "@/lib/notificaciones/notificar";
import { mensajeDeSistema } from "@/lib/chat/chat";
import { aPedidoPublico, cargarPedido, vistaEquipo, type EstadoAjuste, type Pedido } from "./pedidos";

// Ajuste de peso de productos por kg (04-pedidos.md, ronda 6).

export type AccionAjuste = "proponer" | "aceptar" | "rechazar" | "ratificar" | "quitar";

const DEL_VENDEDOR: AccionAjuste[] = ["proponer", "ratificar"];

const DESDE: Record<AccionAjuste, EstadoAjuste[]> = {
  proponer: ["ninguno", "rechazado", "aceptado"],
  aceptar: ["propuesto", "ratificado"],
  rechazar: ["propuesto"],
  ratificar: ["rechazado"],
  quitar: ["ratificado"],
};

const pesos = (n: number) => n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 2 });

export async function ajustarItem(
  usuario: Usuario,
  pedidoId: string,
  itemId: string,
  input: { accion: AccionAjuste; cantidad?: number; importe?: number }
): Promise<Pedido> {
  const pedido = await cargarPedido(pedidoId);
  if (!pedido) throw new AppError("PEDIDO_NO_ENCONTRADO", "El pedido no existe.");
  const accion = input.accion;
  if (!(accion in DESDE)) throw new AppError("TRANSICION_INVALIDA", "Acción de ajuste desconocida.");

  const esComprador = pedido.compradorId === usuario.id;
  const esVendedor = (await accesoATienda(usuario.id, pedido.tiendaId))?.permisos.includes("pedidos") ?? false;
  const delVendedor = DEL_VENDEDOR.includes(accion);
  if ((delVendedor && !esVendedor) || (!delVendedor && !esComprador)) {
    throw new AppError("NO_AUTORIZADO_PEDIDO", "No podés hacer este paso del ajuste.");
  }

  const item = pedido.items.find((i) => i.id === itemId);
  if (!item) throw new AppError("ITEM_NO_ENCONTRADO", "Ese producto no está en el pedido.");
  if (pedido.estado !== "confirmado" || item.producto.catalogo.unidad !== "kg") {
    throw new AppError("AJUSTE_NO_PERMITIDO", "Solo se ajusta el peso de productos por kg con el pedido confirmado.");
  }
  if (!DESDE[accion].includes(item.ajusteEstado)) {
    throw new AppError("TRANSICION_INVALIDA", "Ese paso no corresponde al estado actual del ajuste.");
  }

  const precio = Number(item.precioUnitario);
  const cantidadActual = Number(item.cantidad);
  const propuesta = item.cantidadPropuesta === null ? null : Number(item.cantidadPropuesta);
  let data: Record<string, unknown>;
  let texto: string;
  const nombre = item.producto.nombre;

  if (accion === "proponer") {
    const cantidad =
      input.importe !== undefined ? pesoPorImporte(Number(input.importe), precio) : redondearCantidad("kg", Number(input.cantidad));
    if (!Number.isFinite(cantidad) || cantidad <= 0 || !esCantidadValida("kg", cantidad)) {
      throw new AppError("CANTIDAD_INVALIDA", "Indicá un peso o un importe válido.");
    }
    data = { ajusteEstado: "propuesto", cantidadPropuesta: cantidad };
    texto = `Ajuste de peso: ${nombre} pesó ${formatearCantidad("kg", cantidad)} (${pesos(cantidad * precio)}) en vez de ${formatearCantidad("kg", cantidadActual)}. ¿Te parece bien?`;
  } else if (accion === "ratificar") {
    data = { ajusteEstado: "ratificado" };
    texto = `La tienda mantiene el ajuste de ${nombre}: ${formatearCantidad("kg", propuesta!)} (${pesos(propuesta! * precio)}). Podés aceptarlo o quitar el producto del pedido.`;
  } else if (accion === "aceptar") {
    data = { ajusteEstado: "aceptado", cantidad: propuesta!, cantidadOriginal: item.cantidadOriginal ?? cantidadActual };
    texto = `Acepté el ajuste de ${nombre}: ${formatearCantidad("kg", propuesta!)}.`;
  } else if (accion === "rechazar") {
    data = { ajusteEstado: "rechazado" };
    texto = `No acepto el ajuste de ${nombre} (${formatearCantidad("kg", propuesta!)}).`;
  } else {
    data = { ajusteEstado: "quitado" };
    texto = `Quité ${nombre} del pedido.`;
  }

  await prisma.itemPedido.update({ where: { id: itemId }, data });

  // Si no queda ningún producto, el pedido se cancela solo.
  if (accion === "quitar") {
    const quedan = await prisma.itemPedido.count({ where: { pedidoId, ajusteEstado: { not: "quitado" } } });
    if (quedan === 0) await prisma.pedido.update({ where: { id: pedidoId }, data: { estado: "cancelado" } });
  }

  await sinRomper(() => mensajeDeSistema(pedido, texto, delVendedor, usuario.id));
  await sinRomper(async () =>
    notificar(delVendedor ? [pedido.compradorId] : await destinatariosPedidos(pedido.tiendaId, usuario.id), {
      tipo: "pedido_ajuste",
      titulo: delVendedor ? "Ajuste de peso en tu pedido" : "Respuesta a un ajuste de peso",
      cuerpo: texto,
      url: `/pedidos/${pedidoId}`,
      tiendaId: pedido.tiendaId,
    })
  );

  const actualizado = (await cargarPedido(pedidoId))!;
  return esVendedor ? vistaEquipo(actualizado) : aPedidoPublico(actualizado);
}
