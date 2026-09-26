"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPatch, ApiError } from "@/lib/api-client";

type ItemConfig = { clave: string; valor: number; porDefecto: number; descripcion: string };

// Parámetros de negocio editables por admin (11-admin.md, "Configuración del sistema").
export function ConfigSistema() {
  const [items, setItems] = useState<ItemConfig[]>([]);
  const [borradores, setBorradores] = useState<Record<string, string>>({});
  const [mensaje, setMensaje] = useState<string | null>(null);

  useEffect(() => {
    apiGet<ItemConfig[]>("/api/admin/config")
      .then((r) => {
        setItems(r);
        setBorradores(Object.fromEntries(r.map((i) => [i.clave, String(i.valor)])));
      })
      .catch(() => {});
  }, []);

  async function guardar(clave: string) {
    setMensaje(null);
    try {
      const actualizado = await apiPatch<ItemConfig>("/api/admin/config", { clave, valor: Number(borradores[clave]) });
      setItems((prev) => prev.map((i) => (i.clave === clave ? actualizado : i)));
      setMensaje("Guardado.");
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : "No se pudo guardar.");
    }
  }

  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-3 rounded-card border border-border bg-surface p-3.5">
      <div className="text-[13px] font-semibold text-text">Configuración</div>
      {items.map((i) => (
        <div key={i.clave} className="flex flex-col gap-1.5">
          <label htmlFor={`cfg-${i.clave}`} className="text-[12px] text-text-2">
            {i.descripcion} <span className="text-text-2">(por defecto {i.porDefecto})</span>
          </label>
          <div className="flex gap-2">
            <input
              id={`cfg-${i.clave}`}
              type="number"
              min="0"
              step="any"
              value={borradores[i.clave] ?? ""}
              onChange={(e) => setBorradores({ ...borradores, [i.clave]: e.target.value })}
              className="h-11 min-w-0 flex-1 rounded-control border border-border bg-surface px-3 text-[14px] tabular-nums"
            />
            <button
              type="button"
              onClick={() => guardar(i.clave)}
              disabled={borradores[i.clave] === String(i.valor)}
              className="press h-11 rounded-control bg-primary px-4 text-[13px] font-semibold text-white disabled:opacity-40"
            >
              Guardar
            </button>
          </div>
        </div>
      ))}
      {mensaje && <p role="status" className="text-[12px] text-text-2">{mensaje}</p>}
    </div>
  );
}
