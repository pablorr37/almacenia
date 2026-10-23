"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPost, ApiError } from "@/lib/api-client";
import { useMisTiendas } from "@/lib/hooks/useMisTiendas";

type Persona = { id: string; nombre: string };

// Transferir puntos a alguien del equipo de la misma tienda (23-puntos-pagos.md).
export function TransferirPuntos({ onCambio }: { onCambio: (mensaje: string) => void }) {
  const { lista } = useMisTiendas<{ id: string; nombre: string }>(true);
  const [tiendaId, setTiendaId] = useState<string>("");
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [aUsuarioId, setAUsuarioId] = useState("");
  const [puntos, setPuntos] = useState("");
  const [topes, setTopes] = useState<{ transferenciaMax: number; transferenciaMesMax: number } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tiendaElegida = tiendaId || lista?.[0]?.tienda.id || "";

  useEffect(() => {
    apiGet<{ transferenciaMax: number; transferenciaMesMax: number }>("/api/puntos/precios").then(setTopes).catch(() => {});
  }, []);

  useEffect(() => {
    if (!tiendaElegida) return;
    apiGet<Persona[]>(`/api/puntos/equipo?tiendaId=${tiendaElegida}`)
      .then((p) => {
        setPersonas(p);
        setAUsuarioId(p[0]?.id ?? "");
      })
      .catch(() => setPersonas([]));
  }, [tiendaElegida]);

  if (!lista || lista.length === 0) return null;

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setOcupado(true);
    setError(null);
    try {
      await apiPost("/api/puntos/transferencias", { tiendaId: tiendaElegida, aUsuarioId, puntos: Number(puntos.replace(",", ".")) });
      const nombre = personas.find((p) => p.id === aUsuarioId)?.nombre ?? "";
      setPuntos("");
      onCambio(`Le transferiste ${puntos} puntos a ${nombre}.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo transferir.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <section aria-labelledby="titulo-transferir" className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4 shadow-card">
      <h2 id="titulo-transferir" className="font-display text-[17px] font-bold text-text">
        Transferir puntos al equipo
      </h2>
      <p className="text-[13px] text-text-2">
        Entre personas de una misma tienda.
        {topes ? ` Hasta ${topes.transferenciaMax} por vez y ${topes.transferenciaMesMax} por mes.` : ""} Los puntos recibidos se pueden canjear, pero no
        agrandan el alcance del mapa.
      </p>
      <form onSubmit={enviar} className="flex flex-col gap-2.5">
        {lista.length > 1 && (
          <label className="flex flex-col gap-1 text-[13px] font-semibold text-text">
            Tienda
            <select value={tiendaElegida} onChange={(e) => setTiendaId(e.target.value)} className="h-11 rounded-control border border-border bg-surface px-3 text-[15px] font-normal">
              {lista.map((m) => (
                <option key={m.tienda.id} value={m.tienda.id}>
                  {m.tienda.nombre}
                </option>
              ))}
            </select>
          </label>
        )}
        {personas.length === 0 ? (
          <p className="text-[13px] text-text-2">No hay nadie más en el equipo de esta tienda.</p>
        ) : (
          <>
            <label className="flex flex-col gap-1 text-[13px] font-semibold text-text">
              Para
              <select value={aUsuarioId} onChange={(e) => setAUsuarioId(e.target.value)} className="h-11 rounded-control border border-border bg-surface px-3 text-[15px] font-normal">
                {personas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[13px] font-semibold text-text">
              Puntos
              <input
                inputMode="decimal"
                value={puntos}
                onChange={(e) => setPuntos(e.target.value)}
                placeholder="Ej. 50"
                className="h-11 rounded-control border border-border bg-surface px-3 text-[15px] font-normal"
              />
            </label>
            <button
              type="submit"
              disabled={ocupado || !puntos || !aUsuarioId}
              className="press h-12 rounded-control bg-primary text-[15px] font-semibold text-white disabled:opacity-50"
            >
              Transferir
            </button>
          </>
        )}
        {error && (
          <p role="alert" className="text-[13px] text-estado-rechazado-text">
            {error}
          </p>
        )}
      </form>
    </section>
  );
}
