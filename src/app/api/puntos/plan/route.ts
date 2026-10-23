import { prisma } from "@/lib/prisma";
import { aOrdenPago } from "@/lib/pagos/ordenes";
import { respuestaExitosa, respuestaError } from "@/lib/api-response";
import { usuarioRequerido } from "@/lib/api-sesion";

// 23-puntos-pagos.md: plan, vencimiento, renovación y orden de premium pendiente.
export async function GET() {
  try {
    const usuario = await usuarioRequerido();
    const [u, pendiente] = await Promise.all([
      prisma.usuario.findUniqueOrThrow({ where: { id: usuario.id }, select: { plan: true, planVenceEn: true, renovacionAuto: true } }),
      prisma.ordenPago.findFirst({ where: { usuarioId: usuario.id, concepto: "premium", estado: "pendiente" } }),
    ]);
    return respuestaExitosa({
      plan: u.plan,
      planVenceEn: u.planVenceEn?.toISOString() ?? null,
      renovacionAuto: u.renovacionAuto,
      ordenPendiente: pendiente ? aOrdenPago(pendiente) : null,
    });
  } catch (error) {
    return respuestaError(error);
  }
}
