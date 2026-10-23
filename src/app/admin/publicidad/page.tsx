"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { apiGetPaginado, apiPost, ApiError } from "@/lib/api-client";
import { PantallaAdmin } from "@/components/ui/PantallaAdmin";
import { ETIQUETA_ESPACIO, type EspacioAviso } from "@/lib/publicidad/reglas";

// Moderación y seguimiento de campañas (21-publicidad.md).
type Campania = {
  id: string;
  tienda: { id: string; nombre: string };
  espacio: EspacioAviso;
  titulo: string;
  estado: string;
  desde: string;
  dias: number;
  diasConsumidos: number;
  pago: "puntos" | "pesos";
  puntosPagados: number | null;
  orden: { codigo: string; montoArs: number; estado: string } | null;
  radioKm: number | null;
  motivoRechazo: string | null;
  pieza: { tipo: string; imagenUrl: string | null; ancho: number | null; alto: number | null; texto: string | null; destino: string | null } | null;
  metricas: { impresiones: number; clics: number };
};

const ESTADOS = [
  ["en_moderacion", "Por revisar"],
  ["activa", "Activas"],
  ["pausada", "Pausadas"],
  ["pendiente_pago", "Esperando pago"],
  ["rechazada", "Rechazadas"],
  ["finalizada", "Finalizadas"],
] as const;

export default function AdminPublicidadPage() {
  const { status } = useSession();
  const [estado, setEstado] = useState<string>("en_moderacion");
  const [lista, setLista] = useState<Campania[] | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(() => {
    apiGetPaginado<Campania>(`/api/admin/campanias?estado=${estado}&pageSize=100`)
      .then((r) => setLista(r.data))
      .catch((err) => {
        if (err instanceof ApiError && err.code === "FORBIDDEN") setForbidden(true);
        else setError("No se pudieron cargar las campañas.");
      });
  }, [estado]);

  useEffect(() => {
    if (status === "authenticated") cargar();
  }, [status, cargar]);

  async function moderar(c: Campania, aprobar: boolean) {
    const motivo = aprobar ? undefined : window.prompt(`Motivo del rechazo de «${c.titulo}»:`)?.trim();
    if (!aprobar && !motivo) return;
    try {
      await apiPost(`/api/admin/campanias/${c.id}/moderar`, { aprobar, motivo });
      setLista((l) => l?.filter((x) => x.id !== c.id) ?? null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo moderar.");
    }
  }

  return (
    <PantallaAdmin titulo="Publicidad" forbidden={forbidden} sinSesion={status === "unauthenticated"}>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {ESTADOS.map(([valor, texto]) => (
          <button
            key={valor}
            type="button"
            onClick={() => setEstado(valor)}
            className={`flex-shrink-0 rounded-pill px-3.5 py-1.5 text-[13px] font-semibold ${estado === valor ? "bg-primary text-white" : "border border-border bg-surface text-text"}`}
          >
            {texto}
          </button>
        ))}
      </div>
      {error && <p className="text-[13px] text-estado-rechazado-text">{error}</p>}
      {lista === null ? (
        <p className="text-text-2">Cargando...</p>
      ) : lista.length === 0 ? (
        <p className="text-[14px] text-text-2">No hay campañas en este estado.</p>
      ) : (
        lista.map((c) => (
          <article key={c.id} className="flex flex-col gap-2 rounded-card border border-border bg-surface p-3.5 shadow-card" data-testid="campania-admin">
            <div className="flex flex-col">
              <span className="text-[15px] font-semibold">
                {c.tienda.nombre} · {c.titulo}
              </span>
              <span className="text-[12px] text-text-2">
                {ETIQUETA_ESPACIO[c.espacio]} · desde {c.desde} · {c.diasConsumidos}/{c.dias} días ·{" "}
                {c.pago === "puntos" ? `${c.puntosPagados} puntos` : `pesos${c.orden ? ` (orden ${c.orden.codigo}, ${c.orden.estado})` : ""}`}
                {c.radioKm ? ` · radio ${c.radioKm} km` : ""}
              </span>
            </div>
            {c.pieza?.imagenUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- pieza a moderar
              <img src={c.pieza.imagenUrl} alt="" className="max-h-40 w-full rounded-control border border-border object-contain" />
            )}
            {c.pieza?.texto && <p className="text-[14px]">{c.pieza.texto}</p>}
            {c.pieza?.destino && <p className="break-all text-[12px] text-text-2">Destino: {c.pieza.destino}</p>}
            {c.motivoRechazo && <p className="text-[12px] text-estado-rechazado-text">Motivo: {c.motivoRechazo}</p>}
            <p className="text-[12px] text-text-2 tabular-nums">
              {c.metricas.impresiones} impresiones · {c.metricas.clics} clics
            </p>
            {c.estado === "en_moderacion" && (
              <div className="flex gap-2">
                <button type="button" onClick={() => moderar(c, true)} className="press h-11 flex-1 rounded-control bg-primary text-[14px] font-semibold text-white">
                  Aprobar
                </button>
                <button type="button" onClick={() => moderar(c, false)} className="press h-11 flex-1 rounded-control border border-border text-[14px] font-semibold text-estado-rechazado-text">
                  Rechazar
                </button>
              </div>
            )}
          </article>
        ))
      )}
    </PantallaAdmin>
  );
}
