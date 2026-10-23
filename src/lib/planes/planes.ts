import { AppError } from "@/lib/errors";
import type { Plan as PlanDb } from "@/generated-prisma/client";
import { ORDEN_PLAN, ETIQUETA_PLAN } from "./limites";

// Gating por plan (10-planes.md, 20-precios-facturacion.md): cada feature declara el plan
// mínimo que la habilita. El plan de una tienda es el de su dueño (tiendas.plan es copia).

export type Plan = PlanDb;

export type Feature =
  | "fotos_personalizadas"
  | "destacado_prioritario"
  | "balance_solido"
  | "balance_completo"
  | "exportar_libro_ventas"
  | "crear_categorias";

export const PLAN_MINIMO: Record<Feature, Plan> = {
  fotos_personalizadas: "premium",
  destacado_prioritario: "premium",
  balance_solido: "premium",
  balance_completo: "plata",
  exportar_libro_ventas: "plata",
  crear_categorias: "premium", // 17-rubros-categorias.md
};

export function tienePermiso(tienda: { plan: Plan }, feature: Feature): boolean {
  return ORDEN_PLAN[tienda.plan] >= ORDEN_PLAN[PLAN_MINIMO[feature]];
}

export function exigirFeature(tienda: { plan: Plan }, feature: Feature): void {
  if (!tienePermiso(tienda, feature)) {
    throw new AppError("PLAN_INSUFICIENTE", `Esta función es del plan ${ETIQUETA_PLAN[PLAN_MINIMO[feature]]}.`);
  }
}
