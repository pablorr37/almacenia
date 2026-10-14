"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { apiDelete, apiGet, apiPatch, apiPost, ApiError } from "@/lib/api-client";

// 17-rubros-categorias.md: el admin mantiene los rubros de negocio (almacén, kiosco,
// vivero…) y las categorías de producto (arroz, gaseosa, plantas de interior…).
type Item = { id: string; nombre: string; orden?: number };
type Tipo = "rubros" | "categorias";

const TEXTOS: Record<Tipo, { titulo: string; ayuda: string; placeholder: string; vacio: string }> = {
  rubros: {
    titulo: "Rubros de negocio",
    ayuda: "Lo que elige cada vendedor para su tienda.",
    placeholder: "Nuevo rubro (ej. Vivero)",
    vacio: "Todavía no hay rubros.",
  },
  categorias: {
    titulo: "Categorías de producto",
    ayuda: "Al cargar un producto se elige una; el vendedor le agrega marca, variante y contenido.",
    placeholder: "Nueva categoría (ej. Arroz)",
    vacio: "Todavía no hay categorías: los vendedores no van a poder cargar productos nuevos.",
  },
};

function Lista({ tipo, onForbidden }: { tipo: Tipo; onForbidden: () => void }) {
  const [items, setItems] = useState<Item[]>([]);
  const [nuevo, setNuevo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [nombreEditado, setNombreEditado] = useState("");
  const textos = TEXTOS[tipo];

  const cargar = useCallback(async () => {
    try {
      setItems(await apiGet<Item[]>(`/api/${tipo}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cargar la lista.");
    }
  }, [tipo]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial desde la API (el setState ocurre después del fetch)
    cargar();
  }, [cargar]);

  function manejarError(err: unknown, porDefecto: string) {
    if (err instanceof ApiError && err.code === "FORBIDDEN") onForbidden();
    setError(err instanceof ApiError ? err.message : porDefecto);
  }

  async function agregar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiPost(`/api/admin/${tipo}`, { nombre: nuevo });
      setNuevo("");
      cargar();
    } catch (err) {
      manejarError(err, "No se pudo agregar.");
    }
  }

  async function guardarNombre(item: Item) {
    setError(null);
    try {
      await apiPatch(`/api/admin/${tipo}/${item.id}`, { nombre: nombreEditado });
      setEditando(null);
      cargar();
    } catch (err) {
      manejarError(err, "No se pudo renombrar.");
    }
  }

  async function borrar(item: Item) {
    if (!window.confirm(`¿Borrar "${item.nombre}"?`)) return;
    setError(null);
    try {
      await apiDelete(`/api/admin/${tipo}/${item.id}`);
      cargar();
    } catch (err) {
      manejarError(err, "No se pudo borrar.");
    }
  }

  return (
    <section className="flex flex-col gap-2.5 rounded-card border border-border bg-surface p-4" aria-label={textos.titulo}>
      <div>
        <h2 className="font-display text-[17px] font-bold text-primary-dark">{textos.titulo}</h2>
        <p className="text-[12px] text-text-2">{textos.ayuda}</p>
      </div>
      <form onSubmit={agregar} className="flex gap-2">
        <input
          value={nuevo}
          onChange={(e) => setNuevo(e.target.value)}
          maxLength={40}
          placeholder={textos.placeholder}
          aria-label={textos.placeholder}
          className="h-11 min-w-0 flex-1 rounded-control border border-border bg-bg px-3 text-[14px] focus:border-primary focus:outline-none"
        />
        <button
          type="submit"
          disabled={nuevo.trim().length < 2}
          className="press h-11 flex-shrink-0 rounded-control bg-primary px-4 text-[13px] font-semibold text-white disabled:opacity-50"
        >
          Agregar
        </button>
      </form>
      {error && <p className="text-[13px] text-estado-rechazado-text">{error}</p>}
      {items.length === 0 ? (
        <p className="text-[13px] text-text-2">{textos.vacio}</p>
      ) : (
        <ul className="flex max-h-96 flex-col divide-y divide-border overflow-y-auto">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-2 py-2">
              {editando === item.id ? (
                <>
                  <input
                    autoFocus
                    value={nombreEditado}
                    onChange={(e) => setNombreEditado(e.target.value)}
                    maxLength={40}
                    aria-label={`Nuevo nombre de ${item.nombre}`}
                    className="h-9 min-w-0 flex-1 rounded-control border border-border bg-bg px-2.5 text-[14px]"
                  />
                  <button type="button" onClick={() => guardarNombre(item)} className="text-[12px] font-semibold text-primary">
                    Guardar
                  </button>
                  <button type="button" onClick={() => setEditando(null)} className="text-[12px] font-semibold text-text-2">
                    Cancelar
                  </button>
                </>
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate text-[14px]">{item.nombre}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setEditando(item.id);
                      setNombreEditado(item.nombre);
                    }}
                    className="text-[12px] font-semibold text-accent-text"
                  >
                    Renombrar
                  </button>
                  <button
                    type="button"
                    onClick={() => borrar(item)}
                    aria-label={`Borrar ${item.nombre}`}
                    className="text-[12px] font-semibold text-estado-rechazado-text"
                  >
                    Borrar
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function AdminRubrosCategoriasPage() {
  const { status } = useSession();
  const [forbidden, setForbidden] = useState(false);

  if (status === "unauthenticated" || forbidden) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="text-text-2">Esta sección es solo para administradores.</p>
        <Link href="/" className="font-semibold text-accent-text">
          Volver al mapa
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col gap-4 px-6 py-8">
      <div className="flex items-center gap-3">
        <Link href="/admin" aria-label="Volver al panel" className="flex h-8 w-8 items-center justify-center">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#201A15" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </Link>
        <h1 className="font-display text-[20px] font-bold text-primary-dark">Rubros y categorías</h1>
      </div>
      <Lista tipo="categorias" onForbidden={() => setForbidden(true)} />
      <Lista tipo="rubros" onForbidden={() => setForbidden(true)} />
    </div>
  );
}
