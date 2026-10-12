import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import type { Usuario } from "@/lib/auth/auth";
import type { Pedido } from "@/lib/pedidos/pedidos";
import { sinRomper, otorgarPorVenta } from "@/lib/gamificacion/gamificacion";
import { validarCantidad, type UnidadMedida } from "@/lib/productos/unidades";
import { MEDIOS_DE_PAGO_VALIDOS, type MedioPago } from "@/lib/tiendas/tiendas";
import { resolverCodigoCliente } from "@/lib/clientes/codigo-cliente";
import type { Prisma } from "@/generated-prisma/client";

const PAGE_SIZE_DEFAULT = 20;
const PAGE_SIZE_MAXIMO = 100;

export type OrigenVenta = "presencial" | "pedido";
export type EstadoVenta = "por_cobrar" | "cobrada" | "anulada";

export interface ItemVenta {
  id: string;
  productoId: string;
  nombre: string;
  unidad: UnidadMedida;
  cantidad: number;
  precioUnitario: number;
}

export interface Venta {
  id: string;
  tiendaId: string;
  compradorId: string | null;
  pedidoId: string | null;
  origen: OrigenVenta;
  estado: EstadoVenta;
  medioPago: MedioPago | null;
  nota: string | null;
  total: number;
  items: ItemVenta[];
  comprador: { nombre: string; email: string } | null;
  creadaEn: string;
  cobradaEn: string | null;
  anuladaEn: string | null;
}

const MAX_NOTA = 200;

// Lo que hace falta traer para armar una Venta (ítems con nombre/unidad y comprador).
const INCLUDE_VENTA = {
  items: { include: { producto: { select: { nombre: true, catalogo: { select: { unidad: true } } } } } },
  comprador: { select: { nombre: true, email: true } },
} satisfies Prisma.VentaInclude;

type VentaCompleta = Prisma.VentaGetPayload<{ include: typeof INCLUDE_VENTA }>;

function aVenta(venta: VentaCompleta): Venta {
  return {
    id: venta.id,
    tiendaId: venta.tiendaId,
    compradorId: venta.compradorId,
    pedidoId: venta.pedidoId,
    origen: venta.origen,
    estado: venta.estado,
    medioPago: venta.medioPago,
    nota: venta.nota,
    total: Number(venta.total),
    items: venta.items.map((item) => ({
      id: item.id,
      productoId: item.productoId,
      nombre: item.producto.nombre,
      unidad: item.producto.catalogo.unidad,
      cantidad: Number(item.cantidad),
      precioUnitario: Number(item.precioUnitario),
    })),
    comprador: venta.comprador,
    creadaEn: venta.creadaEn.toISOString(),
    cobradaEn: venta.cobradaEn ? venta.cobradaEn.toISOString() : null,
    anuladaEn: venta.anuladaEn ? venta.anuladaEn.toISOString() : null,
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

interface DatosVenta {
  tiendaId: string;
  compradorId: string | null;
  pedidoId: string | null;
  origen: OrigenVenta;
  estado: "por_cobrar" | "cobrada";
  medioPago?: MedioPago | null;
  nota?: string | null;
}

async function crearVentaEnTransaccion(datos: DatosVenta, items: ItemAProcesar[]): Promise<Venta> {
  const total = Math.round(items.reduce((suma, item) => suma + item.cantidad * item.precioUnitario, 0) * 100) / 100;

  const venta = await prisma.$transaction(async (tx) => {
    for (const item of items) {
      await debitarStockAtomico(tx, item.productoId, item.cantidad);
    }

    return tx.venta.create({
      data: {
        tiendaId: datos.tiendaId,
        compradorId: datos.compradorId,
        pedidoId: datos.pedidoId,
        origen: datos.origen,
        estado: datos.estado,
        medioPago: datos.medioPago ?? null,
        nota: datos.nota ?? null,
        cobradaEn: datos.estado === "cobrada" ? new Date() : null,
        total,
        items: {
          create: items.map((item) => ({
            productoId: item.productoId,
            cantidad: item.cantidad,
            precioUnitario: item.precioUnitario,
          })),
        },
      },
      include: INCLUDE_VENTA,
    });
  });

  // 12-gamificacion.md: solo las ventas cobradas puntúan, fuera de la transacción.
  if (venta.estado === "cobrada") await sinRomper(() => otorgarPorVenta(venta.id));

  return aVenta(venta);
}

export interface CrearVentaPresencialInput {
  items: Array<{ productoId: string; cantidad: number }>;
  medioPago?: MedioPago;
  cobrarAhora?: boolean; // default true (05-ventas.md)
  compradorEmail?: string;
  compradorCodigo?: string; // 6 dígitos o contenido del QR (01-auth.md)
  compradorId?: string;
  nota?: string;
}

async function resolverComprador(vendedor: Usuario, input: CrearVentaPresencialInput): Promise<string | null> {
  if (input.compradorCodigo) {
    const { id } = await resolverCodigoCliente(input.compradorCodigo);
    if (id === vendedor.id) throw new AppError("VENTA_PROPIA", "No podés registrarte una venta a vos mismo.");
    return id;
  }
  const email = input.compradorEmail?.trim().toLowerCase();
  if (!email && !input.compradorId) return null;
  const comprador = await prisma.usuario.findUnique({
    where: email ? { email } : { id: input.compradorId },
    select: { id: true },
  });
  if (!comprador) {
    throw new AppError("COMPRADOR_INVALIDO", "No hay ningún usuario registrado con ese email.");
  }
  if (comprador.id === vendedor.id) {
    throw new AppError("VENTA_PROPIA", "No podés registrarte una venta a vos mismo.");
  }
  return comprador.id;
}

export async function crearVentaPresencial(
  vendedor: Usuario,
  tiendaId: string,
  input: CrearVentaPresencialInput
): Promise<Venta> {
  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new AppError("ITEMS_VACIOS", "La venta debe tener al menos un producto.");
  }

  const tienda = await prisma.tienda.findUnique({ where: { id: tiendaId } });
  if (!tienda) {
    throw new AppError("TIENDA_NO_ENCONTRADA", "La tienda no existe.");
  }
  if (tienda.vendedorId !== vendedor.id) {
    throw new AppError("NO_ES_DUENO_DE_TIENDA", "No sos el dueño de esta tienda.");
  }

  if (input.medioPago !== undefined && input.medioPago !== null) {
    const valido = (MEDIOS_DE_PAGO_VALIDOS as readonly string[]).includes(input.medioPago);
    const aceptado = tienda.mediosDePago.length === 0 || tienda.mediosDePago.includes(input.medioPago);
    if (!valido || !aceptado) {
      throw new AppError("MEDIO_PAGO_INVALIDO", "La tienda no acepta ese medio de pago.");
    }
  }
  const nota = input.nota?.trim() || null;
  if (nota && nota.length > MAX_NOTA) {
    throw new AppError("NOTA_INVALIDA", `La nota puede tener hasta ${MAX_NOTA} caracteres.`);
  }

  const compradorId = await resolverComprador(vendedor, input);

  const productoIds = input.items.map((item) => item.productoId);
  const productos = await prisma.producto.findMany({
    where: { id: { in: productoIds } },
    include: { catalogo: { select: { unidad: true } } },
  });
  const productosPorId = new Map(productos.map((p) => [p.id, p]));

  const items: ItemAProcesar[] = input.items.map((item) => {
    const producto = productosPorId.get(item.productoId);
    if (!producto || producto.tiendaId !== tiendaId) {
      throw new AppError("PRODUCTOS_DE_OTRA_TIENDA", "Todos los productos deben pertenecer a la misma tienda.");
    }
    validarCantidad(producto.catalogo.unidad, item.cantidad);
    return {
      productoId: item.productoId,
      cantidad: item.cantidad,
      // Precio vigente, el mismo que ve el comprador en la tienda.
      precioUnitario: Number(producto.precioOferta ?? producto.precio),
    };
  });

  return crearVentaEnTransaccion(
    {
      tiendaId,
      compradorId,
      pedidoId: null,
      origen: "presencial",
      estado: input.cobrarAhora === false ? "por_cobrar" : "cobrada",
      medioPago: input.medioPago ?? null,
      nota,
    },
    items
  );
}

// 05-ventas.md, "Máquina de estados de cobro": cobrar / anular una venta por cobrar.
export async function transicionarVenta(
  vendedor: Usuario,
  ventaId: string,
  accion: "cobrar" | "anular"
): Promise<Venta> {
  const venta = await prisma.venta.findUnique({
    where: { id: ventaId },
    include: { tienda: { select: { vendedorId: true } }, items: true },
  });
  if (!venta) throw new AppError("VENTA_NO_ENCONTRADA", "La venta no existe.");
  if (venta.tienda.vendedorId !== vendedor.id) {
    throw new AppError("NO_ES_DUENO_DE_TIENDA", "No sos el dueño de esta tienda.");
  }
  if (venta.estado !== "por_cobrar" || (accion !== "cobrar" && accion !== "anular")) {
    throw new AppError("TRANSICION_INVALIDA", "Esta venta ya no está por cobrar.");
  }

  // El UPDATE condicionado a estado = por_cobrar evita cobrar/anular dos veces en paralelo.
  const actualizada = await prisma.$transaction(async (tx) => {
    const cambio = await tx.venta.updateMany({
      where: { id: ventaId, estado: "por_cobrar" },
      data: accion === "cobrar" ? { estado: "cobrada", cobradaEn: new Date() } : { estado: "anulada", anuladaEn: new Date() },
    });
    if (cambio.count === 0) throw new AppError("TRANSICION_INVALIDA", "Esta venta ya no está por cobrar.");
    if (accion === "anular") {
      for (const item of venta.items) {
        await tx.producto.update({ where: { id: item.productoId }, data: { stock: { increment: item.cantidad } } });
      }
    }
    return tx.venta.findUniqueOrThrow({ where: { id: ventaId }, include: INCLUDE_VENTA });
  });

  if (actualizada.estado === "cobrada") await sinRomper(() => otorgarPorVenta(actualizada.id));
  return aVenta(actualizada);
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

  // Los pedidos se pagan al retirar: la venta nace cobrada.
  return crearVentaEnTransaccion(
    { tiendaId: pedido.tiendaId, compradorId: pedido.compradorId, pedidoId: pedido.id, origen: "pedido", estado: "cobrada" },
    items
  );
}

export async function obtenerVenta(usuario: Usuario, ventaId: string): Promise<Venta | null> {
  const venta = await prisma.venta.findUnique({
    where: { id: ventaId },
    include: { ...INCLUDE_VENTA, tienda: true },
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
  estado?: EstadoVenta;
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
    ...(input.estado ? { estado: input.estado } : {}),
  };

  const [ventas, total] = await Promise.all([
    prisma.venta.findMany({
      where,
      include: INCLUDE_VENTA,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { creadaEn: "desc" },
    }),
    prisma.venta.count({ where }),
  ]);

  return { data: ventas.map(aVenta), page, pageSize, total };
}
