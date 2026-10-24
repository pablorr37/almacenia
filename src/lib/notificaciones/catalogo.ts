// Catálogo de notificaciones (22-notificaciones.md). Sin dependencias de servidor: lo
// usan tanto la lógica como la UI.

export type Categoria = "pedidos" | "cuenta" | "avisos" | "ofertas" | "publicidad";

export const CATEGORIAS: readonly Categoria[] = ["pedidos", "cuenta", "avisos", "ofertas", "publicidad"];

export const CATEGORIA_POR_TIPO: Record<string, Categoria> = {
  pedido_nuevo: "pedidos",
  pedido_cancelado: "pedidos",
  pedido_modificado: "pedidos",
  pedido_estado: "pedidos",
  plan_por_vencer: "cuenta",
  plan_vencido: "cuenta",
  plan_renovado: "cuenta",
  pago_confirmado: "cuenta",
  transferencia_recibida: "cuenta",
  campania_aprobada: "cuenta",
  campania_rechazada: "cuenta",
  aviso_interno: "avisos",
  general: "avisos",
  oferta: "ofertas",
  publicidad: "publicidad",
};

export interface CanalesPreferencia {
  enApp: boolean;
  push: boolean;
  email: boolean;
}

export const PREFERENCIA_POR_DEFECTO: Record<Categoria, CanalesPreferencia> = {
  pedidos: { enApp: true, push: true, email: true },
  cuenta: { enApp: true, push: true, email: true },
  avisos: { enApp: true, push: true, email: false },
  ofertas: { enApp: false, push: false, email: false },
  publicidad: { enApp: false, push: false, email: false },
};

// Urgencia y vigencia del push por categoría (22-notificaciones.md).
export const PUSH_POR_CATEGORIA: Record<Categoria, { urgencia: "low" | "normal" | "high"; ttl: number }> = {
  pedidos: { urgencia: "high", ttl: 60 * 60 },
  cuenta: { urgencia: "high", ttl: 60 * 60 * 24 },
  avisos: { urgencia: "normal", ttl: 60 * 60 * 24 },
  ofertas: { urgencia: "low", ttl: 60 * 60 * 24 },
  publicidad: { urgencia: "low", ttl: 60 * 60 * 24 },
};

export const ETIQUETA_CATEGORIA: Record<Categoria, string> = {
  pedidos: "Pedidos",
  cuenta: "Mi cuenta (plan, pagos, puntos, publicidad)",
  avisos: "Avisos de Almacenia",
  ofertas: "Ofertas de tiendas que visitaste",
  publicidad: "Publicidad",
};

export function categoriaDe(tipo: string): Categoria {
  return CATEGORIA_POR_TIPO[tipo] ?? "avisos";
}

export function esCategoria(valor: unknown): valor is Categoria {
  return CATEGORIAS.includes(valor as Categoria);
}
