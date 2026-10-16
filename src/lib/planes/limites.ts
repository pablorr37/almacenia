// Límites y orden de los planes (10-planes.md, 20-precios-facturacion.md). Sin
// dependencias de servidor: los usa también la UI (tope de sucursales en el menú).

export type PlanNombre = "free" | "premium" | "plata";

export const ORDEN_PLAN: Record<PlanNombre, number> = { free: 0, premium: 1, plata: 2 };

// Tiendas por dueño: la principal + las sucursales que permite cada plan.
export const MAX_TIENDAS: Record<PlanNombre, number> = { free: 1, premium: 3, plata: 4 };

export const ETIQUETA_PLAN: Record<PlanNombre, string> = { free: "Free", premium: "Premium", plata: "Plata" };

// El plan siguiente, para invitar a mejorar (null si ya es el máximo).
export function planSiguiente(plan: PlanNombre): PlanNombre | null {
  return plan === "free" ? "premium" : plan === "premium" ? "plata" : null;
}
