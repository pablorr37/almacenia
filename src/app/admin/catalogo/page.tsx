"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { apiDelete, apiGetPaginado, ApiError } from "@/lib/api-client";

// 06-catalogo.md: productos que sumaron compradores desde sus listas. El admin
// borra los que no corresponden (si ninguna tienda los vende).
type Entrada = {
  id: string;
  nombre: string;
  marca: string | null;
  creadoEn: string;
  creadoPor: { nombre: string; email: string } | null;
  tiendas: number;
  listas: number;
};

export default function AdminCatalogoPage() {
  const { status } = useSession();
  const [entradas, setEntradas] = useState<Entrada[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

  useEffect(() => {
    if (status !== "authenticated") return;
    apiGetPaginado<Entrada>("/api/admin/catalogo-compradores?pageSize=100")
      .then((r) => setEntradas(r.data))
      .catch((err) => {
        if (err instanceof ApiError && err.code === "FORBIDDEN") setForbidden(true);
        else setError(err instanceof ApiError ? err.message : "No se pudo cargar el catálogo.");
      });
  }, [status]);

  async function borrar(e: Entrada) {
    if (!window.confirm(`¿Borrar "${e.nombre}" del catálogo?${e.listas ? ` Se va a quitar de ${e.listas} lista(s).` : ""}`)) return;
    try {
      await apiDelete(`/api/admin/catalogo/${e.id}`);
      setEntradas((prev) => prev.filter((x) => x.id !== e.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo borrar.");
    }
  }

  if (forbidden) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="text-text-2">Esta sección es solo para administradores.</p>
        <Link href="/" className="font-semibold text-accent-text">
          Volver al inicio
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col gap-4 px-6 py-8">
      <div className="flex items-center gap-3">
        <Link href="/admin" aria-label="Volver al panel" className="flex h-8 w-8 items-center justify-center">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-text" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </Link>
        <h1 className="font-display text-[20px] font-bold text-primary-dark">Catálogo de compradores</h1>
      </div>
      <p className="text-[13px] text-text-2">
        Productos que los compradores sumaron desde sus listas. Ya pasaron el filtro de groserías; acá podés borrar
        los que no correspondan.
      </p>
      {error && <p className="text-[13px] text-estado-rechazado-text">{error}</p>}
      {entradas.length === 0 && !error && <p className="text-[13px] text-text-2">Todavía no hay productos cargados por compradores.</p>}
      <ul className="flex flex-col gap-2">
        {entradas.map((e) => (
          <li key={e.id} className="flex items-center justify-between gap-2 rounded-card border border-border bg-surface p-3">
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-[14px] font-semibold">
                {e.nombre}
                {e.marca ? ` · ${e.marca}` : ""}
              </span>
              <span className="text-[12px] text-text-2">
                {e.creadoPor ? `${e.creadoPor.nombre} (${e.creadoPor.email})` : "Usuario eliminado"} · {e.tiendas} tienda
                {e.tiendas !== 1 ? "s" : ""} · {e.listas} lista{e.listas !== 1 ? "s" : ""}
              </span>
            </div>
            <button
              type="button"
              disabled={e.tiendas > 0}
              title={e.tiendas > 0 ? "Hay tiendas que lo venden" : undefined}
              onClick={() => borrar(e)}
              className="press flex-shrink-0 rounded-control border border-border px-3 py-2 text-[12px] font-semibold text-estado-rechazado-text disabled:opacity-40"
            >
              Borrar
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
