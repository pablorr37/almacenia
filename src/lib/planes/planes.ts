import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { requireAdmin, type Usuario } from "@/lib/auth/auth";
import type { Plan as PlanDb } from "@/generated-prisma/client";

export type Plan = PlanDb;

export type Feature = "fotos_ilimitadas" | "destacado_prioritario";

const FEATURES_PREMIUM: readonly Feature[] = ["fotos_ilimitadas", "destacado_prioritario"];

export function tienePermiso(tienda: { plan: Plan }, feature: Feature): boolean {
  if (tienda.plan === "premium") return true;
  return !FEATURES_PREMIUM.includes(feature);
}

const PLANES_VALIDOS: readonly Plan[] = ["free", "premium"];

export async function cambiarPlan(admin: Usuario, tiendaId: string, plan: Plan): Promise<{ id: string; plan: Plan }> {
  requireAdmin(admin);

  if (!PLANES_VALIDOS.includes(plan)) {
    throw new AppError("PLAN_INVALIDO", "El plan debe ser 'free' o 'premium'.");
  }

  const tienda = await prisma.tienda.findUnique({ where: { id: tiendaId } });
  if (!tienda) {
    throw new AppError("TIENDA_NO_ENCONTRADA", "La tienda no existe.");
  }

  const actualizada = await prisma.tienda.update({ where: { id: tiendaId }, data: { plan } });
  return { id: actualizada.id, plan: actualizada.plan };
}
