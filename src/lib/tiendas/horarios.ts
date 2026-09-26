// Estado de apertura de una tienda (specs/sdd/02-tiendas.md, "Estado de apertura").
// Funciones puras, sin DB: se usan tanto en el cliente (mapa) como en el server
// (itinerario). Importar este archivo nunca debe arrastrar Prisma.

export const ZONA_HORARIA_NEGOCIO = "America/Argentina/San_Juan";

export interface HorarioTienda {
  diaSemana: number; // 0=domingo .. 6=sábado
  abre: string | null; // "HH:mm"
  cierra: string | null;
}

export type EstadoApertura =
  | { estado: "desconocido" }
  | { estado: "abierta"; cierraA: string }
  | {
      estado: "cerrada";
      proximaApertura: { diaSemana: number; hora: string; enDias: number } | null;
    };

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const DIA_CORTO: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

// Día de la semana y hora "HH:mm" de `fecha` en la zona dada.
export function horaLocal(fecha: Date, zona = ZONA_HORARIA_NEGOCIO): { diaSemana: number; hora: string } {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: zona,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(fecha);
  const valor = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "";
  return { diaSemana: DIA_CORTO[valor("weekday")], hora: `${valor("hour")}:${valor("minute")}` };
}

export function estadoApertura(
  horarios: HorarioTienda[],
  ahora: Date,
  zona = ZONA_HORARIA_NEGOCIO
): EstadoApertura {
  if (horarios.length === 0) return { estado: "desconocido" };

  const porDia = new Map(horarios.map((h) => [h.diaSemana, h]));
  const { diaSemana: hoy, hora } = horaLocal(ahora, zona);

  const deHoy = porDia.get(hoy);
  if (deHoy?.abre && deHoy.cierra && deHoy.abre <= hora && hora < deHoy.cierra) {
    return { estado: "abierta", cierraA: deHoy.cierra };
  }

  // Hoy más tarde (si todavía no abrió) o el próximo día abierto, hasta 7 días
  // adelante (el mismo día de la semana que viene).
  for (let enDias = 0; enDias <= 7; enDias++) {
    const dia = (hoy + enDias) % 7;
    const h = porDia.get(dia);
    if (!h?.abre || !h.cierra) continue;
    if (enDias === 0 && hora >= h.abre) continue;
    return { estado: "cerrada", proximaApertura: { diaSemana: dia, hora: h.abre, enDias } };
  }
  return { estado: "cerrada", proximaApertura: null };
}

export function textoEstadoApertura(estado: EstadoApertura): string {
  if (estado.estado === "desconocido") return "Horario no informado";
  if (estado.estado === "abierta") return `Abierto · Cierra a las ${estado.cierraA}`;
  const prox = estado.proximaApertura;
  if (!prox) return "Cerrado";
  if (prox.enDias === 0) return `Cerrado · Abre a las ${prox.hora}`;
  if (prox.enDias === 1) return `Cerrado · Abre mañana ${prox.hora}`;
  return `Cerrado · Abre el ${DIAS[prox.diaSemana]} ${prox.hora}`;
}
