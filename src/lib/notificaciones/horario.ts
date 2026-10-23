import { ZONA_HORARIA_NEGOCIO } from "@/lib/tiendas/horarios";

// Hora local de San Juan (0–23).
export function horaLocal(fecha: Date): number {
  const hora = new Intl.DateTimeFormat("en-GB", { timeZone: ZONA_HORARIA_NEGOCIO, hour: "2-digit", hourCycle: "h23" }).format(fecha);
  return Number(hora);
}

// Franja [horaInicio, horaFin) en hora de San Juan (22-notificaciones.md: sin
// publicidad push de noche).
export function dentroDeFranja(ahora: Date, horaInicio: number, horaFin: number): boolean {
  const hora = horaLocal(ahora);
  return hora >= horaInicio && hora < horaFin;
}
