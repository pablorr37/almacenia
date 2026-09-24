import { prisma } from "@/lib/prisma";
import { requireAdmin, type Usuario } from "@/lib/auth/auth";
import type { Venta, OrigenVenta } from "@/lib/ventas/ventas";

const PAGE_SIZE_DEFAULT = 20;
const PAGE_SIZE_MAXIMO = 100;

export interface ItemVentaAdmin {
  id: string;
  productoId: string;
  productoNombre: string;
  cantidad: number;
  precioUnitario: number;
}

export interface VentaAdmin extends Omit<Venta, "items"> {
  tiendaNombre: string;
  items: ItemVentaAdmin[];
}

export interface ListarVentasAdminInput {
  tiendaId?: string;
  compradorId?: string;
  page?: number;
  pageSize?: number;
}

export async function listarVentasAdmin(
  admin: Usuario,
  input: ListarVentasAdminInput
): Promise<{ data: VentaAdmin[]; page: number; pageSize: number; total: number }> {
  requireAdmin(admin);

  const page = input.page && input.page > 0 ? input.page : 1;
  const pageSize = input.pageSize && input.pageSize > 0
    ? Math.min(input.pageSize, PAGE_SIZE_MAXIMO)
    : PAGE_SIZE_DEFAULT;

  const where = {
    ...(input.tiendaId ? { tiendaId: input.tiendaId } : {}),
    ...(input.compradorId ? { compradorId: input.compradorId } : {}),
  };

  const [ventas, total] = await Promise.all([
    prisma.venta.findMany({
      where,
      include: {
        items: { include: { producto: { select: { nombre: true } } } },
        tienda: { select: { nombre: true } },
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { creadaEn: "desc" },
    }),
    prisma.venta.count({ where }),
  ]);

  const data: VentaAdmin[] = ventas.map((v) => ({
    id: v.id,
    tiendaId: v.tiendaId,
    compradorId: v.compradorId,
    pedidoId: v.pedidoId,
    origen: v.origen as OrigenVenta,
    total: Number(v.total),
    items: v.items.map((item) => ({
      id: item.id,
      productoId: item.productoId,
      productoNombre: item.producto.nombre,
      cantidad: item.cantidad,
      precioUnitario: Number(item.precioUnitario),
    })),
    tiendaNombre: v.tienda.nombre,
  }));

  return { data, page, pageSize, total };
}
