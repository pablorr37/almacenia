"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPut, ApiError } from "@/lib/api-client";
import { Estrellas } from "./Estrellas";

type Resumen = {
  promedio: number | null;
  cantidad: number;
  miValoracion: { puntuacion: number; comentario: string | null } | null;
};

// Reputación del cliente para el vendedor (13-valoraciones-clientes.md): promedio
// entre todas las tiendas + la valoración propia, editable si `puedeValorar`.
export function ValoracionCliente({ compradorId, puedeValorar }: { compradorId: string; puedeValorar: boolean }) {
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [puntuacion, setPuntuacion] = useState(0);
  const [comentario, setComentario] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<Resumen>(`/api/clientes/${compradorId}/valoracion`)
      .then((r) => {
        setResumen(r);
        setPuntuacion(r.miValoracion?.puntuacion ?? 0);
        setComentario(r.miValoracion?.comentario ?? "");
      })
      .catch(() => {});
  }, [compradorId]);

  async function guardar() {
    if (puntuacion === 0) return;
    setGuardando(true);
    setError(null);
    try {
      await apiPut(`/api/clientes/${compradorId}/valoracion`, { puntuacion, comentario });
      const r = await apiGet<Resumen>(`/api/clientes/${compradorId}/valoracion`);
      setResumen(r);
      setAbierto(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos guardar la valoración.");
    } finally {
      setGuardando(false);
    }
  }

  if (!resumen) return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2 text-[12px] text-text-2">
        <span className="flex items-center gap-1.5">
          <span className="font-semibold text-text">Cliente</span>
          {resumen.promedio !== null ? (
            <>
              <Estrellas valor={Math.round(resumen.promedio)} tamano={14} />
              <span className="tabular-nums">
                {resumen.promedio.toFixed(1)} ({resumen.cantidad})
              </span>
            </>
          ) : (
            <span>sin valoraciones</span>
          )}
        </span>
        {puedeValorar && !abierto && (
          <button
            type="button"
            onClick={() => setAbierto(true)}
            className="press rounded-pill border border-border px-3 py-1.5 text-[12px] font-semibold text-primary-dark"
          >
            {resumen.miValoracion ? "Editar valoración" : "Valorar cliente"}
          </button>
        )}
      </div>
      {abierto && (
        <div className="flex animate-fade-up flex-col gap-2 rounded-control bg-bg p-3">
          <span className="text-[13px] font-semibold">¿Cómo fue este cliente?</span>
          <Estrellas valor={puntuacion} onChange={setPuntuacion} tamano={24} />
          <textarea
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            placeholder="Comentario opcional (solo lo ven otros vendedores)"
            rows={2}
            className="rounded-control border border-border bg-surface px-3 py-2 text-[13px]"
          />
          {error && <span role="alert" className="text-[12px] text-estado-rechazado-text">{error}</span>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setAbierto(false)}
              className="press flex-1 rounded-control border border-border bg-surface py-2.5 text-[13px] font-semibold"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={puntuacion === 0 || guardando}
              onClick={guardar}
              className="press flex-1 rounded-control bg-primary py-2.5 text-[13px] font-semibold text-white disabled:opacity-50"
            >
              {guardando ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
