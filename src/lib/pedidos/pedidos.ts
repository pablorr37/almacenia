import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { esComprable } from "@/lib/productos/productos";
import type { Usuario } from "@/lib/auth/auth";
import type { Pedido as PedidoDb, ItemPedido as ItemPedidoDb, Producto as ProductoDb } from "@/generated-prisma/client";

const PAGE_SIZE_DEFAULT = 20;
const PAGE_SIZE_MAXIMO = 100;

export type EstadoPedido =
  | "pendiente"
  | "confirmado"
  | "listo_para_retirar"
  | "entregado"
  | "rechazado"
  | "cancelado";

export type AccionPedido = "confirmar" | "rechazar" | "marcarListo" | "entregar" | "cancelar";

export interface ItemPedido {
  id: string;
  productoId: string;
  cantidad: number;
  precioUnitario: number;
}

export interface Pedido {
  id: string;
  tiendaId: string;
  compradorId: string;
  estado: EstadoPedido;
  nota: string | null;
  items: ItemPedido[];
}

type PedidoConItems = PedidoDb & { items: ItemPedidoDb[] };

function aPedido(pedido: PedidoConItems): Pedido {
  return {
    id: pedido.id,
    tiendaId: pedido.tiendaId,
    compradorId: pedido.compradorId,
    estado: pedido.estado,
    nota: pedido.nota,
    items: pedido.items.map((item) => ({
      id: item.id,
      productoId: item.productoId,
      cantidad: item.cantidad,
      precioUnitario: Number(item.precioUnitario),
    })),
  };
}

// Tabla de transiciones válidas de la máquina de estados (04-pedidos.md). El
// vendedor ejecuta confirmar/rechazar/marcarListo/entregar; el comprador solo
// cancelar, y únicamente desde 'pendiente'.
const TRANSICIONES: Record<EstadoPedido, Partial<Record<AccionPedido, EstadoPedido>>> = {
  pendiente: { confirmar: "confirmado", rechazar: "rechazado", cancelar: "cancelado" },
  confirmado: { marcarListo: "listo_para_retirar" },
  listo_para_retirar: { entregar: "entregado" },
  entregado: {},
  rechazado: {},
  cancelado: {},
};

const ACCIONES_DEL_COMPRADOR: AccionPedido[] = ["cancelar"];

export function transicionPermitida(estadoActual: EstadoPedido, accion: AccionPedido): boolean {
  return TRANSICIONES[estadoActual][accion] !== undefined;
}

export interface CrearPedidoInput {
  tiendaId: string;
  items: Array<{ productoId: string; cantidad: number }>;
  nota?: string;
}

export async function crearPedido(comprador: Usuario, input: CrearPedidoInput): Promise<Pedido> {
  if (input.items.length === 0) {
    throw new AppError("ITEMS_VACIOS", "El pedido debe tener al menos un producto.");
  }

  const tienda = await prisma.tienda.findUnique({ where: { id: input.tiendaId } });
  if (!tienda) {
    throw new AppError("TIENDA_NO_ENCONTRADA", "La tienda no existe.");
  }

  const productoIds = input.items.map((item) => item.productoId);
  const productos = await prisma.producto.findMany({ where: { id: { in: productoIds } } });
  const productosPorId = new Map<string, ProductoDb>(productos.map((p) => [p.id, p]));

  for (const item of input.items) {
    const producto = productosPorId.get(item.productoId);
    if (!producto || producto.tiendaId !== input.tiendaId) {
      throw new AppError("PRODUCTOS_DE_OTRA_TIENDA", "Todos los productos deben pertenecer a la misma tienda.");
    }
    if (!esComprable({ ...producto, precio: Number(producto.precio) })) {
      throw new AppError("PRODUCTO_NO_COMPRABLE", `El producto "${producto.nombre}" no está disponible.`);
    }
    if (item.cantidad > producto.stock) {
      throw new AppError("STOCK_INSUFICIENTE", `No hay stock suficiente de "${producto.nombre}".`);
    }
  }

  const pedido = await prisma.pedido.create({
    data: {
      tiendaId: input.tiendaId,
      compradorId: comprador.id,
      nota: input.nota ?? null,
      items: {
        create: input.items.map((item) => ({
          productoId: item.productoId,
          cantidad: item.cantidad,
          precioUnitario: productosPorId.get(item.productoId)!.precio,
        })),
      },
    },
    include: { items: true },
  });

  return aPedido(pedido);
}

async function obtenerPedidoConTienda(pedidoId: string) {
  return prisma.pedido.findUnique({
    where: { id: pedidoId },
    include: { items: true, tienda: true },
  });
}

export async function obtenerPedido(usuario: Usuario, pedidoId: string): Promise<Pedido | null> {
  const pedido = await obtenerPedidoConTienda(pedidoId);
  if (!pedido) return null;

  const esComprador = pedido.compradorId === usuario.id;
  const esVendedor = pedido.tienda.vendedorId === usuario.id;
  if (!esComprador && !esVendedor) {
    throw new AppError("NO_AUTORIZADO_PEDIDO", "No tenés acceso a este pedido.");
  }

  return aPedido(pedido);
}

export async function transicionarPedido(
  usuario: Usuario,
  pedidoId: string,
  accion: AccionPedido
): Promise<Pedido> {
  const pedido = await obtenerPedidoConTienda(pedidoId);
  if (!pedido) {
    throw new AppError("PEDIDO_NO_ENCONTRADO", "El pedido no existe.");
  }

  const esComprador = pedido.compradorId === usuario.id;
  const esVendedor = pedido.tienda.vendedorId === usuario.id;
  if (!esComprador && !esVendedor) {
    throw new AppError("NO_AUTORIZADO_PEDIDO", "No tenés acceso a este pedido.");
  }

  const rolPuedeEjecutar = ACCIONES_DEL_COMPRADOR.includes(accion) ? esComprador : esVendedor;
  if (!rolPuedeEjecutar || !transicionPermitida(pedido.estado, accion)) {
    throw new AppError(
      "TRANSICION_INVALIDA",
      `No se puede ejecutar "${accion}" desde el estado "${pedido.estado}".`
    );
  }

  const nuevoEstado = TRANSICIONES[pedido.estado][accion]!;
  const actualizado = await prisma.pedido.update({
    where: { id: pedidoId },
    data: { estado: nuevoEstado },
    include: { items: true },
  });

  return aPedido(actualizado);
}

// No está en las firmas de 04-pedidos.md, pero hace falta para el endpoint
// GET /api/pedidos?tiendaId=|compradorId= que sí está documentado ahí.
export interface ListarPedidosInput {
  tiendaId?: string;
  compradorId?: string;
  page?: number;
  pageSize?: number;
}

export async function listarPedidos(
  usuario: Usuario,
  input: ListarPedidosInput
): Promise<{ data: Pedido[]; page: number; pageSize: number; total: number }> {
  const where: { tiendaId?: string; compradorId?: string } = {};

  if (input.tiendaId) {
    const tienda = await prisma.tienda.findUnique({ where: { id: input.tiendaId } });
    if (!tienda) {
      throw new AppError("TIENDA_NO_ENCONTRADA", "La tienda no existe.");
    }
    if (tienda.vendedorId !== usuario.id) {
      throw new AppError("NO_ES_DUENO_DE_TIENDA", "No sos el dueño de esta tienda.");
    }
    where.tiendaId = input.tiendaId;
  }

  if (input.compradorId) {
    if (input.compradorId !== usuario.id) {
      throw new AppError("NO_AUTORIZADO_PEDIDO", "Solo podés listar tus propios pedidos.");
    }
    where.compradorId = input.compradorId;
  }

  const page = input.page && input.page > 0 ? input.page : 1;
  const pageSize = input.pageSize && input.pageSize > 0
    ? Math.min(input.pageSize, PAGE_SIZE_MAXIMO)
    : PAGE_SIZE_DEFAULT;

  const [pedidos, total] = await Promise.all([
    prisma.pedido.findMany({
      where,
      include: { items: true },
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { creadoEn: "desc" },
    }),
    prisma.pedido.count({ where }),
  ]);

  return { data: pedidos.map(aPedido), page, pageSize, total };
}
