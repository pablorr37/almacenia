"use client";

import type { HorarioTienda } from "@/lib/tiendas/horarios";

// Editor de horarios con franjas (02-tiendas.md): por día, cerrado o de 1 a 3
// franjas (horario partido, ej. 9-12 y 16-20). Controlado: recibe y emite la lista
// completa de entradas de la semana, en el formato que espera el API.

const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
// Orden de la semana laboral argentina: lunes primero, domingo al final.
const ORDEN = [1, 2, 3, 4, 5, 6, 0];
const MAX_FRANJAS = 3;

type Franja = { abre: string; cierra: string };

function franjasDe(horarios: HorarioTienda[], dia: number): Franja[] {
  return horarios
    .filter((h) => h.diaSemana === dia && h.abre !== null && h.cierra !== null)
    .map((h) => ({ abre: h.abre!, cierra: h.cierra! }))
    .sort((a, b) => a.abre.localeCompare(b.abre));
}

// Problemas visibles antes de guardar (el backend valida lo mismo: HORARIO_INVALIDO).
export function problemaDeFranjas(franjas: Franja[]): string | null {
  for (const f of franjas) {
    if (!f.abre || !f.cierra) return "Completá las horas";
    if (f.abre >= f.cierra) return "La apertura tiene que ser antes del cierre";
  }
  const ordenadas = [...franjas].sort((a, b) => a.abre.localeCompare(b.abre));
  for (let i = 1; i < ordenadas.length; i++) {
    if (ordenadas[i].abre < ordenadas[i - 1].cierra) return "Las franjas se superponen";
  }
  return null;
}

export function EditorHorarios({
  horarios,
  onChange,
}: {
  horarios: HorarioTienda[];
  onChange: (horarios: HorarioTienda[]) => void;
}) {
  function reemplazarDia(dia: number, franjas: Franja[] | null) {
    const resto = horarios.filter((h) => h.diaSemana !== dia);
    const nuevas: HorarioTienda[] =
      franjas === null || franjas.length === 0
        ? [{ diaSemana: dia, abre: null, cierra: null }]
        : franjas.map((f) => ({ diaSemana: dia, abre: f.abre, cierra: f.cierra }));
    onChange([...resto, ...nuevas].sort((a, b) => a.diaSemana - b.diaSemana || (a.abre ?? "").localeCompare(b.abre ?? "")));
  }

  function copiarADiasHabiles(dia: number) {
    const franjas = franjasDe(horarios, dia);
    let resultado = horarios.filter((h) => h.diaSemana === 0 || h.diaSemana === 6 || h.diaSemana === dia);
    for (const d of [1, 2, 3, 4, 5]) {
      if (d === dia) continue;
      resultado = [
        ...resultado,
        ...(franjas.length === 0
          ? [{ diaSemana: d, abre: null, cierra: null }]
          : franjas.map((f) => ({ diaSemana: d, abre: f.abre, cierra: f.cierra }))),
      ];
    }
    onChange(resultado.sort((a, b) => a.diaSemana - b.diaSemana || (a.abre ?? "").localeCompare(b.abre ?? "")));
  }

  return (
    <div className="flex flex-col gap-2">
      {ORDEN.map((dia) => {
        const franjas = franjasDe(horarios, dia);
        const abierto = franjas.length > 0;
        const problema = problemaDeFranjas(franjas);
        return (
          <div
            key={dia}
            data-testid={`dia-${dia}`}
            className="flex flex-col gap-2 rounded-control border border-border bg-surface p-2.5"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-semibold text-text">{DIAS[dia]}</span>
              <label className="flex flex-shrink-0 items-center gap-1.5 text-[12px] text-text-2">
                <input
                  type="checkbox"
                  checked={!abierto}
                  onChange={() => reemplazarDia(dia, abierto ? null : [{ abre: "09:00", cierra: "21:00" }])}
                  aria-label={`${DIAS[dia]} cerrado`}
                />
                Cerrado
              </label>
            </div>

            {franjas.map((f, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <input
                  type="time"
                  value={f.abre}
                  aria-label={`${DIAS[dia]} franja ${i + 1} abre`}
                  onChange={(e) => reemplazarDia(dia, franjas.map((x, j) => (j === i ? { ...x, abre: e.target.value } : x)))}
                  className="w-full min-w-0 rounded-control border border-border bg-bg px-2 py-1.5 text-[13px]"
                />
                <span className="flex-shrink-0 text-text-2">–</span>
                <input
                  type="time"
                  value={f.cierra}
                  aria-label={`${DIAS[dia]} franja ${i + 1} cierra`}
                  onChange={(e) => reemplazarDia(dia, franjas.map((x, j) => (j === i ? { ...x, cierra: e.target.value } : x)))}
                  className="w-full min-w-0 rounded-control border border-border bg-bg px-2 py-1.5 text-[13px]"
                />
                {franjas.length > 1 && (
                  <button
                    type="button"
                    onClick={() => reemplazarDia(dia, franjas.filter((_, j) => j !== i))}
                    aria-label={`Quitar franja ${i + 1} del ${DIAS[dia]}`}
                    className="press h-8 w-8 flex-shrink-0 rounded-pill text-[16px] text-text-2"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}

            {problema && <span className="text-[12px] text-estado-rechazado-text">{problema}</span>}

            {abierto && (
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {franjas.length < MAX_FRANJAS && (
                  <button
                    type="button"
                    onClick={() => {
                      const ultima = franjas[franjas.length - 1];
                      // Propone la franja de la tarde (o una hora después de la última).
                      const nueva = ultima.cierra < "16:00" ? { abre: "16:00", cierra: "20:00" } : { abre: ultima.cierra, cierra: "23:59" };
                      reemplazarDia(dia, [...franjas, nueva]);
                    }}
                    className="text-[12px] font-semibold text-accent-text"
                  >
                    + Agregar franja
                  </button>
                )}
                {dia >= 1 && dia <= 5 && (
                  <button
                    type="button"
                    onClick={() => copiarADiasHabiles(dia)}
                    className="text-[12px] font-semibold text-text-2"
                  >
                    Copiar a lunes–viernes
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
