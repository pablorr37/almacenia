import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import type { Usuario } from "@/lib/auth/auth";
import type { Pedido } from "@/lib/pedidos/pedidos";
import { sinRomper, otorgarPorVenta } from "@/lib/gamificacion/gamificacion";
import type {
  Venta as VentaDb,
  ItemVenta as ItemVentaDb,
  Prisma,
} from "@/generated-prisma/client";

const PAGE_SIZE_DEFAULT = 20;
const PAGE_SIZE_MAXIMO = 100;

export type OrigenVenta = "presencial" | "pedido";

export interface ItemVenta {
  id: string;
  productoId: string;
  cantidad: number;
  precioUnitario: number;
}

export interface Venta {
  id: string;
  tiendaId: string;
  compradorId: string | null;
  pedidoId: string | null;
  origen: OrigenVenta;
  total: number;
  items: ItemVenta[];
}

type VentaConItems = VentaDb & { items: ItemVentaDb[] };

function aVenta(venta: VentaConItems): Venta {
  return {
    id: venta.id,
    tiendaId: venta.tiendaId,
    compradorId: venta.compradorId,
    pedidoId: venta.pedidoId,
    origen: venta.origen,
    total: Number(venta.total),
    items: venta.items.map((item) => ({
      id: item.id,
      productoId: item.productoId,
      cantidad: item.cantidad,
      precioUnitario: Number(item.precioUnitario),
    })),
  };
}

interface ItemAProcesar {
  productoId: string;
  cantidad: number;
  precioUnitario: number;
}

// Débito atómico: un único UPDATE con WHERE stock >= cantidad es atómico a nivel de
// Postgres (sin necesidad de aislamiento SERIALIZABLE) — si count da 0, no alcanzaba.
async function debitarStockAtomico(
  tx: Prisma.TransactionClient,
  productoId: string,
  cantidad: number
): Promise<void> {
  const resultado = await tx.producto.updateMany({
    where: { id: productoId, stock: { gte: cantidad } },
    data: { stock: { decrement: cantidad } },
  });
  if (resultado.count === 0) {
    throw new AppError("STOCK_INSUFICIENTE", "No hay stock suficiente para completar la venta.");
  }
}

async function crearVentaEnTransaccion(
  tiendaId: string,
  compradorId: string | null,
  pedidoId: string | null,
  origen: OrigenVenta,
  items: ItemAProcesar[]
): Promise<Venta> {
  const total = items.reduce((suma, item) => suma + item.cantidad * item.precioUnitario, 0);

  const venta = await prisma.$transaction(async (tx) => {
    for (const item of items) {
      await debitarStockAtomico(tx, item.productoId, item.cantidad);
    }

    return tx.venta.create({
      data: {
        tiendaId,
        compradorId,
        pedidoId,
        origen,
        total,
        items: {
          create: items.map((item) => ({
            productoId: item.productoId,
            cantidad: item.cantidad,
            precioUnitario: item.precioUnitario,
          })),
        },
      },
      include: { items: true },
    });
  });

  // 12-gamificacion.md: después de confirmar la venta, fuera de su transacción.
  await sinRomper(() => otorgarPorVenta(venta.id));

  return aVenta(venta);
}

export interface CrearVentaPresencialInput {
  compradorId?: string;
  items: Array<{ productoId: string; cantidad: number }>;
}

export async function crearVentaPresencial(
  vendedor: Usuario,
  tiendaId: string,
  input: CrearVentaPresencialInput
): Promise<Venta> {
  if (input.items.length === 0) {
    throw new AppError("ITEMS_VACIOS", "La venta debe tener al menos un producto.");
  }

  const tienda = await prisma.tienda.findUnique({ where: { id: tiendaId } });
  if (!tienda) {
    throw new AppError("TIENDA_NO_ENCONTRADA", "La tienda no existe.");
  }
  if (tienda.vendedorId !== vendedor.id) {
    throw new AppError("NO_ES_DUENO_DE_TIENDA", "No sos el dueño de esta tienda.");
  }

  if (input.compradorId) {
    const comprador = await prisma.usuario.findUnique({ where: { id: input.compradorId } });
    if (!comprador) {
      throw new AppError("COMPRADOR_INVALIDO", "El comprador indicado no existe.");
    }
  }

  const productoIds = input.items.map((item) => item.productoId);
  const productos = await prisma.producto.findMany({ where: { id: { in: productoIds } } });
  const productosPorId = new Map(productos.map((p) => [p.id, p]));

  const items: ItemAProcesar[] = input.items.map((item) => {
    const producto = productosPorId.get(item.productoId);
    if (!producto || producto.tiendaId !== tiendaId) {
      throw new AppError("PRODUCTOS_DE_OTRA_TIENDA", "Todos los productos deben pertenecer a la misma tienda.");
    }
    return {
      productoId: item.productoId,
      cantidad: item.cantidad,
      precioUnitario: Number(producto.precio),
    };
  });

  return crearVentaEnTransaccion(tiendaId, input.compradorId ?? null, null, "presencial", items);
}

// Llamada internamente desde pedidos.transicionarPedido al ejecutar 'entregar'. No
// se expone como endpoint propio (ver Endpoints REST de 05-ventas.md). Los items del
// pedido ya traen precioUnitario congelado desde su creación (04-pedidos.md) — no se
// vuelve a consultar el precio actual del producto.
export async function crearVentaDesdePedido(pedido: Pedido): Promise<Venta> {
  const items: ItemAProcesar[] = pedido.items.map((item) => ({
    productoId: item.productoId,
    cantidad: item.cantidad,
    precioUnitario: item.precioUnitario,
  }));

  return crearVentaEnTransaccion(pedido.tiendaId, pedido.compradorId, pedido.id, "pedido", items);
}

export async function obtenerVenta(usuario: Usuario, ventaId: string): Promise<Venta | null> {
  const venta = await prisma.venta.findUnique({
    where: { id: ventaId },
    include: { items: true, tienda: true },
  });
  if (!venta) return null;

  const esVendedor = venta.tienda.vendedorId === usuario.id;
  const esComprador = venta.compradorId === usuario.id;
  if (!esVendedor && !esComprador) {
    throw new AppError("NO_AUTORIZADO_VENTA", "No tenés acceso a esta venta.");
  }

  return aVenta(venta);
}

export interface ListarVentasInput {
  tiendaId: string;
  desde?: Date;
  hasta?: Date;
  page?: number;
  pageSize?: number;
}

export async function listarVentas(
  vendedor: Usuario,
  input: ListarVentasInput
): Promise<{ data: Venta[]; page: number; pageSize: number; total: number }> {
  const tienda = await prisma.tienda.findUnique({ where: { id: input.tiendaId } });
  if (!tienda) {
    throw new AppError("TIENDA_NO_ENCONTRADA", "La tienda no existe.");
  }
  if (tienda.vendedorId !== vendedor.id) {
    throw new AppError("NO_ES_DUENO_DE_TIENDA", "No sos el dueño de esta tienda.");
  }

  const page = input.page && input.page > 0 ? input.page : 1;
  const pageSize = input.pageSize && input.pageSize > 0
    ? Math.min(input.pageSize, PAGE_SIZE_MAXIMO)
    : PAGE_SIZE_DEFAULT;

  const where = {
    tiendaId: input.tiendaId,
    ...(input.desde || input.hasta
      ? { creadaEn: { ...(input.desde ? { gte: input.desde } : {}), ...(input.hasta ? { lte: input.hasta } : {}) } }
      : {}),
  };

  const [ventas, total] = await Promise.all([
    prisma.venta.findMany({
      where,
      include: { items: true },
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { creadaEn: "desc" },
    }),
    prisma.venta.count({ where }),
  ]);

  return { data: ventas.map(aVenta), page, pageSize, total };
}
