"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { apiDelete, apiGetPaginado, ApiError } from "@/lib/api-client";
import { BotonVolver } from "@/components/ui/BotonVolver";

type ResumenLista = { id: string; nombre: string; cantidadItems: number; actualizadaEn: string };

// Mis listas de compras (14-listas-compras.md): puede haber tantas como quiera.
export default function ListasPage() {
  const { status } = useSession();
  const [listas, setListas] = useState<ResumenLista[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "authenticated") return;
    apiGetPaginado<ResumenLista>("/api/listas?pageSize=100")
      .then((r) => setListas(r.data))
      .catch((err) => setError(err instanceof ApiError ? err.message : "No pudimos cargar tus listas."));
  }, [status]);

  async function borrar(id: string) {
    if (!window.confirm("¿Borrar esta lista?")) return;
    await apiDelete(`/api/listas/${id}`);
    setListas((prev) => prev?.filter((l) => l.id !== id) ?? null);
  }

  if (status === "unauthenticated") {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-text-2">Iniciá sesión para armar tus listas de compras.</p>
        <Link href="/login" className="font-semibold text-accent-dark">
          Iniciar sesión
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-5 py-6">
      <div className="flex items-center gap-2">
        <BotonVolver href="/" etiqueta="Volver al mapa" />
        <h1 className="flex-1 font-display text-[22px] font-bold text-primary-dark">Mis listas</h1>
        <Link
          href="/listas/nueva"
          className="press flex h-11 items-center rounded-pill bg-primary px-4 text-[14px] font-semibold text-white shadow-cta"
        >
          + Nueva
        </Link>
      </div>
      <p className="text-[13px] text-text-2">
        Armá listas sin entrar a una tienda y usá <strong>Buscar y comparar</strong> para ver dónde te conviene comprar
        cada cosa.
      </p>

      {error && (
        <p role="alert" className="text-[13px] text-estado-rechazado-text">
          {error}
        </p>
      )}

      {listas === null && !error && (
        <div className="flex flex-col gap-2" aria-hidden="true">
          {[0, 1].map((i) => (
            <div key={i} className="h-[74px] animate-pulse rounded-card bg-placeholder" />
          ))}
        </div>
      )}

      {listas?.length === 0 && (
        <Link
          href="/listas/nueva"
          className="press-soft flex animate-fade-up flex-col items-center gap-2 rounded-card border border-dashed border-border px-6 py-10 text-center"
        >
          <span className="text-[15px] font-semibold text-text">Todavía no tenés listas</span>
          <span className="text-[13px] font-semibold text-primary">Crear mi primera lista →</span>
        </Link>
      )}

      <ul className="flex flex-col gap-2">
        {listas?.map((l, i) => (
          <li
            key={l.id}
            style={{ "--i": i } as React.CSSProperties}
            className="stagger flex animate-fade-up items-center gap-2 rounded-card border border-border bg-surface p-2 pl-4 shadow-card"
          >
            <Link href={`/listas/${l.id}`} className="flex min-w-0 flex-1 flex-col py-2">
              <span className="truncate text-[15px] font-semibold text-text">{l.nombre}</span>
              <span className="text-[12px] text-text-2">
                {l.cantidadItems} {l.cantidadItems === 1 ? "producto" : "productos"}
              </span>
            </Link>
            <Link
              href={`/listas/${l.id}/comparar`}
              className="press flex h-10 items-center rounded-pill bg-primary-soft px-3 text-[12px] font-semibold text-primary-dark"
            >
              Comparar
            </Link>
            <button
              type="button"
              onClick={() => borrar(l.id)}
              aria-label={`Borrar ${l.nombre}`}
              className="press flex h-10 w-10 items-center justify-center rounded-pill text-text-2"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
              </svg>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
