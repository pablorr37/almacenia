"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useSession } from "next-auth/react";
import { apiGet, apiPost, ApiError } from "@/lib/api-client";
import { PantallaAdmin } from "@/components/ui/PantallaAdmin";
import { ETIQUETA_PLAN, type PlanNombre } from "@/lib/planes/limites";

// Avisos internos y generales por segmento, enviados por lotes (22-notificaciones.md).
type Envio = {
  id: string;
  tipo: string;
  titulo: string;
  cuerpo: string;
  estado: "enviando" | "enviado" | "cancelado";
  total: number;
  enviados: number;
  creadoEn: string;
};
type Rol = "comprador" | "vendedor";

export default function AdminNotificacionesPage() {
  const { status } = useSession();
  const [envios, setEnvios] = useState<Envio[] | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [tipo, setTipo] = useState<"general" | "aviso_interno">("general");
  const [titulo, setTitulo] = useState("");
  const [cuerpo, setCuerpo] = useState("");
  const [url, setUrl] = useState("");
  const [roles, setRoles] = useState<Rol[]>([]);
  const [planes, setPlanes] = useState<PlanNombre[]>([]);
  const [conteo, setConteo] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const segmento = { ...(roles.length ? { roles } : {}), ...(planes.length ? { planes } : {}) };
  const claveSegmento = JSON.stringify(segmento);

  const cargar = useCallback(() => {
    apiGet<Envio[]>("/api/admin/envios")
      .then(setEnvios)
      .catch((err) => {
        if (err instanceof ApiError && err.code === "FORBIDDEN") setForbidden(true);
      });
  }, []);

  useEffect(() => {
    if (status === "authenticated") cargar();
  }, [status, cargar]);

  useEffect(() => {
    if (status !== "authenticated") return;
    apiPost<{ cantidad: number }>("/api/admin/envios/contar", { segmento: JSON.parse(claveSegmento) })
      .then((r) => setConteo(r.cantidad))
      .catch(() => setConteo(null));
  }, [status, claveSegmento]);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (!window.confirm(`¿Enviar «${titulo}» a ${conteo ?? "?"} personas?`)) return;
    setEnviando(true);
    setError(null);
    try {
      await apiPost("/api/admin/envios", { tipo, titulo, cuerpo, url: url || null, segmento });
      setTitulo("");
      setCuerpo("");
      setUrl("");
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo enviar.");
    } finally {
      setEnviando(false);
    }
  }

  async function cancelar(id: string) {
    await apiPost(`/api/admin/envios/${id}/cancelar`).catch(() => {});
    cargar();
  }

  const alternar = <T,>(lista: T[], v: T) => (lista.includes(v) ? lista.filter((x) => x !== v) : [...lista, v]);

  return (
    <PantallaAdmin titulo="Notificaciones" forbidden={forbidden} sinSesion={status === "unauthenticated"}>
      <form onSubmit={enviar} className="flex flex-col gap-3 rounded-card border border-border bg-surface p-3.5">
        <h2 className="text-[15px] font-bold">Nuevo envío</h2>
        <label className="flex flex-col gap-1 text-[12px] font-semibold text-text-2">
          Tipo
          <select value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)} className="h-11 rounded-control border border-border bg-surface px-2 text-[14px] font-normal text-text">
            <option value="general">General (para todos)</option>
            <option value="aviso_interno">Aviso interno</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[12px] font-semibold text-text-2">
          Título
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={80} required className="h-11 rounded-control border border-border bg-surface px-3 text-[14px] font-normal text-text" />
        </label>
        <label className="flex flex-col gap-1 text-[12px] font-semibold text-text-2">
          Texto
          <textarea value={cuerpo} onChange={(e) => setCuerpo(e.target.value)} maxLength={300} rows={3} required className="rounded-control border border-border bg-surface px-3 py-2 text-[14px] font-normal text-text" />
        </label>
        <label className="flex flex-col gap-1 text-[12px] font-semibold text-text-2">
          Enlace dentro de la app (opcional)
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="/mapa" className="h-11 rounded-control border border-border bg-surface px-3 text-[14px] font-normal text-text" />
        </label>
        <fieldset className="flex flex-wrap gap-3 text-[13px]">
          <legend className="mb-1 text-[12px] font-semibold text-text-2">Para (sin marcar = todos)</legend>
          {(["comprador", "vendedor"] as Rol[]).map((r) => (
            <label key={r} className="flex min-h-11 items-center gap-1.5">
              <input type="checkbox" checked={roles.includes(r)} onChange={() => setRoles((l) => alternar(l, r))} className="h-4 w-4 accent-primary" />
              {r === "comprador" ? "Compradores" : "Vendedores"}
            </label>
          ))}
          {(["free", "premium", "plata"] as PlanNombre[]).map((p) => (
            <label key={p} className="flex min-h-11 items-center gap-1.5">
              <input type="checkbox" checked={planes.includes(p)} onChange={() => setPlanes((l) => alternar(l, p))} className="h-4 w-4 accent-primary" />
              {ETIQUETA_PLAN[p]}
            </label>
          ))}
        </fieldset>
        <p className="text-[13px] text-text">
          Destinatarios: <strong data-testid="conteo-envio">{conteo ?? "…"}</strong>
        </p>
        {error && <p className="text-[13px] text-estado-rechazado-text">{error}</p>}
        <button type="submit" disabled={enviando || !titulo || !cuerpo} className="press h-12 rounded-control bg-primary text-[15px] font-semibold text-white disabled:opacity-50">
          {enviando ? "Enviando..." : "Enviar"}
        </button>
      </form>

      <section className="flex flex-col gap-2">
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-text-2">Envíos</h2>
        {envios?.length === 0 && <p className="text-[13px] text-text-2">Todavía no hay envíos.</p>}
        {envios?.map((e) => (
          <article key={e.id} className="flex items-center justify-between gap-2 rounded-card border border-border bg-surface p-3 shadow-card">
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-[14px] font-semibold">{e.titulo}</span>
              <span className="text-[12px] text-text-2 tabular-nums">
                {e.estado === "enviando" ? "Enviando" : e.estado === "enviado" ? "Enviado" : "Cancelado"} · {e.enviados}/{e.total}
              </span>
            </span>
            {e.estado === "enviando" && (
              <button type="button" onClick={() => cancelar(e.id)} className="press min-h-11 text-[13px] font-semibold text-estado-rechazado-text">
                Cancelar
              </button>
            )}
          </article>
        ))}
      </section>
    </PantallaAdmin>
  );
}
