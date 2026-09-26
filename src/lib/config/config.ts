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
  "itinerario.costo_km": {
    porDefecto: 300,
    entero: false,
    descripcion: "Buscar y comparar: pesos (ARS) que 'cuesta' cada km de recorrido al comparar planes de compra.",
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
  const def = CLAVES_CONFIG[clave];
  if (typeof valor !== "number" || !Number.isFinite(valor) || valor < 0 || (def.entero && !Number.isInteger(valor))) {
    throw new AppError(
      "VALOR_CONFIG_INVALIDO",
      def.entero ? "El valor debe ser un entero mayor o igual a 0." : "El valor debe ser un número mayor o igual a 0."
    );
  }
  await prisma.configuracionSistema.upsert({ where: { clave }, create: { clave, valor }, update: { valor } });
  return { clave, valor, porDefecto: def.porDefecto, descripcion: def.descripcion };
}
