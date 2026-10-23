"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { apiGetPaginado, apiPost, ApiError } from "@/lib/api-client";
import { PantallaAdmin } from "@/components/ui/PantallaAdmin";

// Órdenes de pago en pesos con confirmación manual (23-puntos-pagos.md).
type Orden = {
  id: string;
  codigo: string;
  concepto: "premium" | "publicidad";
  montoArs: number;
  estado: "pendiente" | "pagada" | "cancelada" | "vencida";
  creadaEn: string;
  pagadaEn: string | null;
  usuario: { id: string; nombre: string; email: string };
};

const ESTADOS = [
  ["pendiente", "Pendientes"],
  ["pagada", "Pagadas"],
  ["vencida", "Vencidas"],
  ["cancelada", "Canceladas"],
] as const;
const pesos = (n: number) => n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 2 });
const fecha = (iso: string) =>
  new Date(iso).toLocaleString("es-AR", { timeZone: "America/Argentina/San_Juan", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default function AdminPagosPage() {
  const { status } = useSession();
  const [estado, setEstado] = useState<string>("pendiente");
  const [lista, setLista] = useState<Orden[] | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(() => {
    apiGetPaginado<Orden>(`/api/admin/pagos?estado=${estado}&pageSize=100`)
      .then((r) => setLista(r.data))
      .catch((err) => {
        if (err instanceof ApiError && err.code === "FORBIDDEN") setForbidden(true);
        else setError("No se pudieron cargar las órdenes.");
      });
  }, [estado]);

  useEffect(() => {
    if (status === "authenticated") cargar();
  }, [status, cargar]);

  async function accion(o: Orden, que: "confirmar" | "cancelar") {
    const pregunta = que === "confirmar" ? `¿Confirmar el pago de ${pesos(o.montoArs)} de ${o.usuario.nombre} (orden ${o.codigo})?` : `¿Cancelar la orden ${o.codigo}?`;
    if (!window.confirm(pregunta)) return;
    try {
      await apiPost(`/api/admin/pagos/${o.id}/${que}`);
      setLista((l) => l?.filter((x) => x.id !== o.id) ?? null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo.");
    }
  }

  return (
    <PantallaAdmin titulo="Pagos en pesos" forbidden={forbidden} sinSesion={status === "unauthenticated"}>
      <p className="text-[13px] text-text-2">
        Pago manual (transferencia o efectivo). Al confirmar se activa el premium o la campaña pasa a revisión.
      </p>
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
        <p className="text-[14px] text-text-2">No hay órdenes en este estado.</p>
      ) : (
        lista.map((o) => (
          <article key={o.id} className="flex flex-col gap-1.5 rounded-card border border-border bg-surface p-3.5 shadow-card" data-testid="orden-admin">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-mono text-[15px] font-bold">{o.codigo}</span>
              <span className="text-[15px] font-bold tabular-nums">{pesos(o.montoArs)}</span>
            </div>
            <span className="text-[13px]">
              {o.concepto === "premium" ? "Plan premium" : "Publicidad"} · {o.usuario.nombre} ({o.usuario.email})
            </span>
            <span className="text-[12px] text-text-2">
              Creada {fecha(o.creadaEn)}
              {o.pagadaEn ? ` · pagada ${fecha(o.pagadaEn)}` : ""}
            </span>
            {o.estado === "pendiente" && (
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => accion(o, "confirmar")} className="press h-11 flex-1 rounded-control bg-primary text-[14px] font-semibold text-white">
                  Confirmar pago
                </button>
                <button type="button" onClick={() => accion(o, "cancelar")} className="press h-11 flex-1 rounded-control border border-border text-[14px] font-semibold text-estado-rechazado-text">
                  Cancelar
                </button>
              </div>
            )}
          </article>
        ))
      )}
    </PantallaAdmin>
  );
}
