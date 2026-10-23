// Configuración del sistema editable por admin (specs/sdd/11-admin.md).
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { requireAdmin, type Usuario } from "@/lib/auth/auth";

export const CLAVES_CONFIG = {
  "gamificacion.umbral_items_compra_extra": {
    porDefecto: 5,
    entero: true,
    descripcion:
      "Gamificación: productos distintos que tiene que superar una 2ª compra del día en la misma tienda para volver a sumar el punto de 'tienda visitada'.",
  },
  "gamificacion.porcentaje_puntos_equipo": {
    porDefecto: 50,
    entero: true,
    maximo: 100,
    descripcion:
      "Gamificación: % de los puntos de una venta que se lleva el miembro del equipo que la registró (el resto, el dueño). Cada tienda puede definir el suyo.",
  },
  "balance.umbral_stock_bajo": {
    porDefecto: 3,
    entero: true,
    descripcion: "Balance completo (plata): un producto disponible con este stock o menos aparece en las alertas de stock bajo.",
  },
  "itinerario.costo_km": {
    porDefecto: 300,
    entero: false,
    descripcion: "Buscar y comparar: pesos (ARS) que 'cuesta' cada km de recorrido al comparar planes de compra.",
  },
  // 23-puntos-pagos.md: precios en puntos y en pesos, topes de transferencias.
  "canje.premium_puntos": {
    porDefecto: 1500,
    entero: true,
    descripcion: "Canjes: puntos para un período de plan premium.",
  },
  "canje.premium_dias": {
    porDefecto: 30,
    entero: true,
    minimo: 1,
    descripcion: "Canjes: días que dura un período de premium (pagado con puntos o con pesos).",
  },
  "canje.publicidad_dia_puntos": {
    porDefecto: 100,
    entero: true,
    descripcion: "Publicidad: puntos por día de campaña en un espacio de la app (inicio, lista, comparar, pie de tienda).",
  },
  "canje.publicidad_pin_dia_puntos": {
    porDefecto: 50,
    entero: true,
    descripcion: "Publicidad: puntos por día de 'tienda destacada' (nombre junto al pin del mapa).",
  },
  "canje.publicidad_push_puntos": {
    porDefecto: 300,
    entero: true,
    descripcion: "Publicidad: puntos por un envío de publicidad push.",
  },
  "canje.reintegro_pct": {
    porDefecto: 100,
    entero: true,
    maximo: 100,
    descripcion: "Publicidad: % de los puntos de los días no usados que se devuelven al finalizar una campaña antes de tiempo.",
  },
  "precio.premium_ars": {
    porDefecto: 3000,
    entero: false,
    descripcion: "Pagos en pesos: precio (ARS) de un período de premium.",
  },
  "precio.publicidad_dia_ars": {
    porDefecto: 1000,
    entero: false,
    descripcion: "Pagos en pesos: precio (ARS) por día de campaña en un espacio de la app.",
  },
  "precio.publicidad_pin_dia_ars": {
    porDefecto: 500,
    entero: false,
    descripcion: "Pagos en pesos: precio (ARS) por día de tienda destacada en el mapa.",
  },
  "precio.publicidad_push_ars": {
    porDefecto: 3000,
    entero: false,
    descripcion: "Pagos en pesos: precio (ARS) por un envío de publicidad push.",
  },
  "puntos.transferencia_max": {
    porDefecto: 500,
    entero: true,
    descripcion: "Transferencias en el equipo: máximo de puntos por transferencia.",
  },
  "puntos.transferencia_mes_max": {
    porDefecto: 2000,
    entero: true,
    descripcion: "Transferencias en el equipo: máximo de puntos que una persona puede enviar por mes.",
  },
  "pagos.gracia_dias": {
    porDefecto: 3,
    entero: true,
    descripcion: "Renovación en pesos: días que se mantiene el premium vencido mientras se espera el pago.",
  },
  // 21-publicidad.md y 22-notificaciones.md
  "publicidad.frecuencia_dia": {
    porDefecto: 3,
    entero: true,
    minimo: 1,
    descripcion: "Publicidad: veces por día que un mismo usuario puede ver una misma campaña.",
  },
  "notif.publicidad_push_semana": {
    porDefecto: 2,
    entero: true,
    descripcion: "Notificaciones: máximo de publicidades push por usuario en 7 días.",
  },
  "notif.hora_inicio": {
    porDefecto: 8,
    entero: true,
    maximo: 24,
    descripcion: "Notificaciones: hora (San Juan) desde la que se puede enviar publicidad push.",
  },
  "notif.hora_fin": {
    porDefecto: 22,
    entero: true,
    maximo: 24,
    descripcion: "Notificaciones: hora (San Juan) hasta la que se puede enviar publicidad push.",
  },
} as const;

export type ClaveConfig = keyof typeof CLAVES_CONFIG;

export interface ItemConfig {
  clave: ClaveConfig;
  valor: number;
  porDefecto: number;
  descripcion: string;
}

function esClave(clave: string): clave is ClaveConfig {
  return Object.prototype.hasOwnProperty.call(CLAVES_CONFIG, clave);
}

export async function obtenerConfig(clave: ClaveConfig): Promise<number> {
  const fila = await prisma.configuracionSistema.findUnique({ where: { clave } });
  return typeof fila?.valor === "number" ? fila.valor : CLAVES_CONFIG[clave].porDefecto;
}

export async function listarConfig(admin: Usuario): Promise<ItemConfig[]> {
  requireAdmin(admin);
  const filas = await prisma.configuracionSistema.findMany();
  const porClave = new Map(filas.map((f) => [f.clave, f.valor]));
  return (Object.keys(CLAVES_CONFIG) as ClaveConfig[]).map((clave) => {
    const guardado = porClave.get(clave);
    return {
      clave,
      valor: typeof guardado === "number" ? guardado : CLAVES_CONFIG[clave].porDefecto,
      porDefecto: CLAVES_CONFIG[clave].porDefecto,
      descripcion: CLAVES_CONFIG[clave].descripcion,
    };
  });
}

export async function actualizarConfig(admin: Usuario, clave: string, valor: number): Promise<ItemConfig> {
  requireAdmin(admin);
  if (!esClave(clave)) {
    throw new AppError("CLAVE_CONFIG_INVALIDA", "Esa clave de configuración no existe.");
  }
  const def: { entero: boolean; minimo?: number; maximo?: number; porDefecto: number; descripcion: string } =
    CLAVES_CONFIG[clave];
  const minimo = def.minimo ?? 0;
  const maximo = def.maximo ?? Infinity;
  if (
    typeof valor !== "number" ||
    !Number.isFinite(valor) ||
    valor < minimo ||
    valor > maximo ||
    (def.entero && !Number.isInteger(valor))
  ) {
    const rango = Number.isFinite(maximo) ? `entre ${minimo} y ${maximo}` : `mayor o igual a ${minimo}`;
    throw new AppError("VALOR_CONFIG_INVALIDO", def.entero ? `El valor debe ser un entero ${rango}.` : `El valor debe ser un número ${rango}.`);
  }
  await prisma.configuracionSistema.upsert({ where: { clave }, create: { clave, valor }, update: { valor } });
  return { clave, valor, porDefecto: def.porDefecto, descripcion: def.descripcion };
}
