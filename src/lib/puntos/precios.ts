import { obtenerConfig } from "@/lib/config/config";
import type { EspacioAviso } from "@/generated-prisma/client";

// Precios vigentes en puntos y en pesos (23-puntos-pagos.md), todos calibrables en el admin.

export interface PrecioEspacio {
  puntos: number;
  ars: number;
  unidad: "dia" | "envio";
}

export interface PreciosVigentes {
  premiumPuntos: number;
  premiumDias: number;
  premiumArs: number;
  publicidad: Record<EspacioAviso, PrecioEspacio>;
  transferenciaMax: number;
  transferenciaMesMax: number;
}

export async function precioEspacio(espacio: EspacioAviso): Promise<PrecioEspacio> {
  if (espacio === "push") {
    return { puntos: await obtenerConfig("canje.publicidad_push_puntos"), ars: await obtenerConfig("precio.publicidad_push_ars"), unidad: "envio" };
  }
  if (espacio === "pin_mapa") {
    return {
      puntos: await obtenerConfig("canje.publicidad_pin_dia_puntos"),
      ars: await obtenerConfig("precio.publicidad_pin_dia_ars"),
      unidad: "dia",
    };
  }
  return { puntos: await obtenerConfig("canje.publicidad_dia_puntos"), ars: await obtenerConfig("precio.publicidad_dia_ars"), unidad: "dia" };
}

export async function preciosVigentes(): Promise<PreciosVigentes> {
  const espacios: EspacioAviso[] = ["inicio", "lista", "comparar", "tienda_pie", "pin_mapa", "push"];
  const publicidad = Object.fromEntries(await Promise.all(espacios.map(async (e) => [e, await precioEspacio(e)]))) as Record<
    EspacioAviso,
    PrecioEspacio
  >;
  return {
    premiumPuntos: await obtenerConfig("canje.premium_puntos"),
    premiumDias: await obtenerConfig("canje.premium_dias"),
    premiumArs: await obtenerConfig("precio.premium_ars"),
    publicidad,
    transferenciaMax: await obtenerConfig("puntos.transferencia_max"),
    transferenciaMesMax: await obtenerConfig("puntos.transferencia_mes_max"),
  };
}
