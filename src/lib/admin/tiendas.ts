// Acciones del admin sobre tiendas (11-admin.md). El cambio de plan vive en
// src/lib/planes/planes.ts (10-planes.md).
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { requireAdmin, type Usuario } from "@/lib/auth/auth";

// Verifica (o quita la verificación de) una tienda sin necesidad de solicitud. Si
// había una solicitud pendiente, queda resuelta en la misma transacción.
export async function verificarTiendaAdmin(
  admin: Usuario,
  tiendaId: string,
  verificada: boolean
): Promise<{ id: string; verificada: boolean }> {
  requireAdmin(admin);
  if (typeof verificada !== "boolean") {
    throw new AppError("VERIFICADA_INVALIDA", "verificada tiene que ser true o false.");
  }
  const tienda = await prisma.tienda.findUnique({ where: { id: tiendaId }, select: { id: true } });
  if (!tienda) throw new AppError("TIENDA_NO_ENCONTRADA", "La tienda no existe.");

  const [actualizada] = await prisma.$transaction([
    prisma.tienda.update({ where: { id: tiendaId }, data: { verificada }, select: { id: true, verificada: true } }),
    prisma.solicitudVerificacion.updateMany({
      where: { tiendaId, estado: "pendiente" },
      data: { estado: verificada ? "aprobada" : "rechazada", revisadaEn: new Date(), revisadaPor: admin.id },
    }),
  ]);
  return actualizada;
}
