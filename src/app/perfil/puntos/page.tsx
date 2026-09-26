"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { apiGet, apiGetPaginado, ApiError } from "@/lib/api-client";
import { formatoPuntos } from "@/components/ui/PuntosChip";
import { useConteo } from "@/lib/hooks/useConteo";

type Movimiento = {
  id: string;
  tipo: string;
  descripcion: string;
  puntos: number;
  creadoEn: string;
  tienda: { id: string; nombre: string } | null;
  contraparte: { id: string; nombre: string } | null;
};

const PAGE_SIZE = 20;

const formatoFecha = new Intl.DateTimeFormat("es-AR", {
  timeZone: "America/Argentina/San_Juan",
  day: "numeric",
  month: "short",
  year: "numeric",
});
const formatoHora = new Intl.DateTimeFormat("es-AR", {
  timeZone: "America/Argentina/San_Juan",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

// Historial de puntos (12-gamificacion.md): hora, fecha, y la tienda o el cliente
// por el que se ganó cada punto.
export default function PuntosPage() {
  const { status } = useSession();
  const [total, setTotal] = useState<number | null>(null);
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [cantidad, setCantidad] = useState(0);
  const [pagina, setPagina] = useState(0);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const totalAnimado = useConteo(total ?? 0);

  const cargarPagina = useCallback(async (page: number) => {
    setCargando(true);
    try {
      const body = await apiGetPaginado<Movimiento>(`/api/gamificacion/historial?page=${page}&pageSize=${PAGE_SIZE}`);
      setMovimientos((prev) => (page === 1 ? body.data : [...prev, ...body.data]));
      setCantidad(body.total);
      setPagina(page);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos cargar tu historial.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    if (status !== "authenticated") return;
    apiGet<{ total: number }>("/api/gamificacion/puntos")
      .then((r) => setTotal(r.total))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial de datos remotos
    cargarPagina(1);
  }, [status, cargarPagina]);

  if (status === "unauthenticated") {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-text-2">Necesitás iniciar sesión para ver tus puntos.</p>
        <Link href="/login" className="font-semibold text-accent-dark">
          Iniciar sesión
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col gap-5 px-5 py-6">
      <div className="flex items-center gap-2">
        <Link href="/perfil" aria-label="Volver a mi cuenta" className="press flex h-11 w-11 items-center justify-center rounded-pill">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </Link>
        <h1 className="font-display text-[22px] font-bold text-primary-dark">Mis puntos</h1>
      </div>

      <div className="flex animate-scale-in flex-col items-center gap-1 rounded-card bg-primary px-5 py-6 text-white shadow-cta">
        <span className="text-[13px] font-semibold uppercase tracking-wide text-primary-soft">Total acumulado</span>
        <span className="font-display text-[44px] font-bold leading-none tabular-nums">
          {formatoPuntos(Math.round(totalAnimado * 10) / 10)}
        </span>
        <span className="text-[13px] text-primary-soft">
          {cantidad} {cantidad === 1 ? "movimiento" : "movimientos"}
        </span>
      </div>

      {error && (
        <p role="alert" className="text-[13px] text-estado-rechazado-text">
          {error}
        </p>
      )}

      {!cargando && movimientos.length === 0 && !error && (
        <div className="rounded-card border border-border bg-surface p-5 text-center text-[14px] text-text-2">
          Todavía no sumaste puntos. Visitá tiendas, hacé check-in cuando estés en el local y comprá para empezar.
        </div>
      )}

      <ul className="flex flex-col gap-2">
        {movimientos.map((m, i) => {
          const fecha = new Date(m.creadoEn);
          return (
            <li
              key={m.id}
              style={{ "--i": i % PAGE_SIZE } as React.CSSProperties}
              className="stagger flex animate-fade-up items-center gap-3 rounded-card border border-border bg-surface p-3.5 shadow-card"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[14px] font-semibold text-text">{m.descripcion}</span>
                {m.tienda && (
                  <Link href={`/tiendas/${m.tienda.id}`} className="truncate text-[13px] font-semibold text-primary-dark">
                    {m.tienda.nombre}
                  </Link>
                )}
                {m.contraparte && <span className="truncate text-[13px] text-text-2">Cliente: {m.contraparte.nombre}</span>}
                <span className="text-[12px] text-text-2 tabular-nums">
                  {formatoFecha.format(fecha)} · {formatoHora.format(fecha)} h
                </span>
              </div>
              <span
                className={`flex-shrink-0 rounded-pill px-2.5 py-1 text-[14px] font-bold tabular-nums ${
                  m.puntos >= 0 ? "bg-primary-soft text-primary-dark" : "bg-estado-rechazado-bg text-estado-rechazado-text"
                }`}
              >
                {m.puntos >= 0 ? "+" : ""}
                {formatoPuntos(m.puntos)}
              </span>
            </li>
          );
        })}
      </ul>

      {movimientos.length < cantidad && (
        <button
          type="button"
          disabled={cargando}
          onClick={() => cargarPagina(pagina + 1)}
          className="press h-11 rounded-control border border-border bg-surface text-[14px] font-semibold text-text disabled:opacity-50"
        >
          {cargando ? "Cargando..." : "Ver más"}
        </button>
      )}
    </div>
  );
}
