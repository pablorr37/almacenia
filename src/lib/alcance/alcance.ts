import { prisma } from "@/lib/prisma";
import { puntosGanados } from "@/lib/gamificacion/gamificacion";
import type { Plan } from "@/generated-prisma/client";

// Radio de alcance del mapa según plan y puntos (18-alcance.md).

// Provincia de San Juan aproximada por un rectángulo (plan plata).
export const SAN_JUAN = { latMin: -32.6, latMax: -28.4, lonMin: -70.6, lonMax: -66.9 } as const;

const RADIO_MINIMO_KM = 3;
const RADIO_MAXIMO_KM = 15;

// Tramos del plan free: [desde, hasta) en puntos y radio al inicio y al final.
// `curva` va de 0 a 1 con x (posición dentro del tramo) y da la forma del tramo;
// `inversa` es su inversa, para calcular los puntos que faltan.
const TRAMOS = [
  { desde: 100, hasta: 500, rDesde: 3, rHasta: 7, curva: (x: number) => 1 - (1 - x) ** 2, inversa: (y: number) => 1 - Math.sqrt(1 - y) },
  { desde: 500, hasta: 1500, rDesde: 7, rHasta: 10, curva: (x: number) => 1 - (1 - x) ** 4, inversa: (y: number) => 1 - (1 - y) ** 0.25 },
  { desde: 1500, hasta: 2000, rDesde: 10, rHasta: 15, curva: (x: number) => x, inversa: (y: number) => y },
] as const;

// Radio en km; null = toda la provincia (plata).
export function radioAlcanceKm(plan: Plan, puntos: number): number | null {
  if (plan === "plata") return null;
  if (plan === "premium") return RADIO_MAXIMO_KM;
  const p = Math.max(0, puntos);
  if (p < TRAMOS[0].desde) return RADIO_MINIMO_KM;
  for (const t of TRAMOS) {
    if (p < t.hasta) {
      const x = (p - t.desde) / (t.hasta - t.desde);
      return t.rDesde + (t.rHasta - t.rDesde) * t.curva(x);
    }
  }
  return RADIO_MAXIMO_KM;
}

// Próximo km entero y los puntos mínimos para llegar a él; null si no aplica.
export function proximoUmbral(plan: Plan, puntos: number): { radioKm: number; puntos: number } | null {
  const radio = radioAlcanceKm(plan, puntos);
  if (plan !== "free" || radio === null || radio >= RADIO_MAXIMO_KM) return null;
  const objetivo = Math.floor(radio + 1e-9) + 1;
  const tramo = TRAMOS.find((t) => objetivo > t.rDesde && objetivo <= t.rHasta)!;
  const x = tramo.inversa((objetivo - tramo.rDesde) / (tramo.rHasta - tramo.rDesde));
  // Redondeo previo para que un 500,0000001 por error de coma flotante no dé 501.
  const necesarios = Math.ceil(Math.round((tramo.desde + x * (tramo.hasta - tramo.desde)) * 1e6) / 1e6);
  return { radioKm: objetivo, puntos: necesarios };
}

export interface Alcance {
  invitado: boolean;
  plan: Plan;
  puntos: number;
  radioKm: number | null;
  provincia: boolean;
  proximoUmbral: { radioKm: number; puntos: number } | null;
}

function armarAlcance(invitado: boolean, plan: Plan, puntos: number): Alcance {
  const radioKm = radioAlcanceKm(plan, puntos);
  return { invitado, plan, puntos, radioKm, provincia: radioKm === null, proximoUmbral: proximoUmbral(plan, puntos) };
}

// Alcance del usuario (plan desde la DB, puntos ganados: canjear no lo achica). null = invitado.
export async function obtenerAlcance(usuarioId: string | null): Promise<Alcance> {
  if (!usuarioId) return armarAlcance(true, "free", 0);
  const [usuario, puntos] = await Promise.all([
    prisma.usuario.findUnique({ where: { id: usuarioId }, select: { plan: true } }),
    puntosGanados(usuarioId),
  ]);
  return armarAlcance(false, usuario?.plan ?? "free", puntos);
}
