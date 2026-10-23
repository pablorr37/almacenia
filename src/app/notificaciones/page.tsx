"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { apiGetPaginado, apiPost } from "@/lib/api-client";

type Notificacion = { id: string; tipo: string; titulo: string; cuerpo: string; url: string | null; leida: boolean; creadaEn: string };

const PAGE_SIZE = 20;
const formato = new Intl.DateTimeFormat("es-AR", {
  timeZone: "America/Argentina/San_Juan",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

// Centro de notificaciones (22-notificaciones.md).
export default function NotificacionesPage() {
  const { status } = useSession();
  const router = useRouter();
  const [lista, setLista] = useState<Notificacion[] | null>(null);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);

  const cargar = useCallback(async (page: number) => {
    const r = await apiGetPaginado<Notificacion>(`/api/notificaciones?page=${page}&pageSize=${PAGE_SIZE}`);
    setLista((l) => (page === 1 || !l ? r.data : [...l, ...r.data]));
    setTotal(r.total);
    setPagina(page);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial de datos remotos
    if (status === "authenticated") cargar(1).catch(() => setLista([]));
  }, [status, cargar]);

  async function abrir(n: Notificacion) {
    if (!n.leida) {
      setLista((l) => l?.map((x) => (x.id === n.id ? { ...x, leida: true } : x)) ?? null);
      await apiPost(`/api/notificaciones/${n.id}/leida`).catch(() => {});
    }
    if (n.url) router.push(n.url);
  }

  async function leerTodas() {
    await apiPost("/api/notificaciones/leer-todas").catch(() => {});
    setLista((l) => l?.map((x) => ({ ...x, leida: true })) ?? null);
  }

  if (status === "unauthenticated") {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-text-2">Necesitás iniciar sesión para ver tus notificaciones.</p>
        <Link href="/login" className="font-semibold text-accent-text">
          Iniciar sesión
        </Link>
      </div>
    );
  }

  const hayNoLeidas = lista?.some((n) => !n.leida);
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col gap-4 px-5 py-6">
      <div className="flex items-center gap-2">
        <Link href="/" aria-label="Volver al inicio" className="press flex h-11 w-11 items-center justify-center rounded-pill">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </Link>
        <h1 className="flex-1 font-display text-[22px] font-bold text-primary-dark">Notificaciones</h1>
        {hayNoLeidas && (
          <button type="button" onClick={leerTodas} className="press min-h-11 px-2 text-[13px] font-semibold text-primary-dark">
            Marcar todas como leídas
          </button>
        )}
      </div>

      {lista === null ? (
        <div className="h-40 animate-pulse rounded-card bg-placeholder" />
      ) : lista.length === 0 ? (
        <div className="rounded-card border border-border bg-surface p-5 text-center text-[14px] text-text-2">
          No tenés notificaciones. Elegí qué querés recibir desde{" "}
          <Link href="/perfil" className="font-semibold text-primary-dark">
            tu perfil
          </Link>
          .
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {lista.map((n, i) => (
            <li key={n.id} style={{ "--i": i % PAGE_SIZE } as React.CSSProperties} className="stagger animate-fade-up">
              <button
                type="button"
                onClick={() => abrir(n)}
                className={`press-soft flex w-full items-start gap-3 rounded-card border p-3.5 text-left shadow-card ${
                  n.leida ? "border-border bg-surface" : "border-primary/40 bg-primary-soft/40"
                }`}
              >
                <span aria-hidden="true" className={`mt-1.5 h-2.5 w-2.5 flex-shrink-0 rounded-pill ${n.leida ? "bg-transparent" : "bg-accent"}`} />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[14px] font-semibold text-text">{n.titulo}</span>
                  <span className="text-[13px] text-text-2">{n.cuerpo}</span>
                  <span className="text-[12px] text-text-2 tabular-nums">{formato.format(new Date(n.creadaEn))} h</span>
                </span>
                {!n.leida && <span className="sr-only">Sin leer</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {lista && lista.length < total && (
        <button type="button" onClick={() => cargar(pagina + 1)} className="press h-11 rounded-control border border-border bg-surface text-[14px] font-semibold text-text">
          Ver más
        </button>
      )}
    </div>
  );
}
