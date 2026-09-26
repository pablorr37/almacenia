"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { apiGet, apiGetPaginado, apiPatch, ApiError } from "@/lib/api-client";
import { BuscadorFotos, type DestinoFoto } from "@/components/fotos/BuscadorFotos";
import type { FotoBanco } from "@/lib/fotos/banco";

// Curaduría del banco de fotos (11-admin.md, 16-banco-fotos.md): admin y testers.
type EntradaSinFoto = { id: string; nombre: string; marca: string | null; tiendas: number };

export default function AdminFotosPage() {
  const { status } = useSession();
  const [curador, setCurador] = useState<boolean | null>(null);
  const [sinFoto, setSinFoto] = useState<EntradaSinFoto[]>([]);
  const [totalSinFoto, setTotalSinFoto] = useState(0);
  const [filtro, setFiltro] = useState("");
  const [pendientes, setPendientes] = useState<FotoBanco[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [buscador, setBuscador] = useState<{ texto: string; destino: DestinoFoto | null; entradaId?: string } | null>(null);

  const cargarSinFoto = useCallback(async (q: string) => {
    try {
      const r = await apiGetPaginado<EntradaSinFoto>(`/api/fotos/catalogo-sin-foto?q=${encodeURIComponent(q)}&pageSize=50`);
      setSinFoto(r.data);
      setTotalSinFoto(r.total);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cargar el catálogo.");
    }
  }, []);

  const cargarPendientes = useCallback(async () => {
    try {
      setPendientes((await apiGetPaginado<FotoBanco>("/api/fotos/banco?estado=pendiente&pageSize=60")).data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudieron cargar las fotos pendientes.");
    }
  }, []);

  useEffect(() => {
    if (status !== "authenticated") return;
    apiGet<{ curador: boolean }>("/api/fotos/permisos")
      .then((p) => {
        setCurador(p.curador);
        if (p.curador) {
          cargarSinFoto("");
          cargarPendientes();
        }
      })
      .catch(() => setCurador(false));
  }, [status, cargarSinFoto, cargarPendientes]);

  async function revisar(foto: FotoBanco, estado: "aprobada" | "rechazada") {
    try {
      await apiPatch(`/api/fotos/banco/${foto.id}`, { estado });
      setPendientes((prev) => prev.filter((f) => f.id !== foto.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo revisar la foto.");
    }
  }

  if (status === "unauthenticated") {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-text-2">Necesitás iniciar sesión.</p>
        <Link href="/login" className="font-semibold text-accent-text">
          Iniciar sesión
        </Link>
      </div>
    );
  }

  if (curador === false) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="text-text-2">Esta sección es para admins y testers.</p>
        <Link href="/" className="font-semibold text-accent-text">
          Volver al mapa
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col gap-5 px-6 py-8">
      <div className="flex items-center gap-3">
        <Link href="/admin" aria-label="Volver al panel" className="flex h-8 w-8 items-center justify-center">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#201A15" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </Link>
        <h1 className="font-display text-[20px] font-bold text-primary-dark">Banco de fotos</h1>
      </div>

      <p className="text-[13px] text-text-2">
        Buscá fotos libres de derechos (CC0 / dominio público) y aprobalas: quedan en el banco para que cualquier
        vendedor las encuentre.
      </p>

      <button
        type="button"
        onClick={() => setBuscador({ texto: "", destino: null })}
        className="press h-11 rounded-control bg-primary text-[14px] font-semibold text-white"
      >
        Buscar y aprobar fotos
      </button>

      {error && <p className="text-[13px] text-estado-rechazado-text">{error}</p>}

      <section className="flex flex-col gap-2.5">
        <h2 className="text-[15px] font-bold">Pendientes de revisión ({pendientes.length})</h2>
        {pendientes.length === 0 ? (
          <p className="text-[13px] text-text-2">No hay fotos pendientes.</p>
        ) : (
          <ul className="grid grid-cols-3 gap-2">
            {pendientes.map((f) => (
              <li key={f.id} className="flex flex-col gap-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.url} alt={f.etiquetas.join(", ")} className="aspect-square w-full rounded-control object-cover" />
                <span className="truncate text-[10px] text-text-2">{f.etiquetas.join(", ")}</span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => revisar(f, "aprobada")}
                    className="press h-8 flex-1 rounded-control bg-primary text-[11px] font-semibold text-white"
                  >
                    Aprobar
                  </button>
                  <button
                    type="button"
                    onClick={() => revisar(f, "rechazada")}
                    aria-label="Rechazar"
                    className="press h-8 w-8 rounded-control border border-border text-[13px] text-estado-rechazado-text"
                  >
                    ×
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2.5">
        <h2 className="text-[15px] font-bold">Catálogo sin foto ({totalSinFoto})</h2>
        <input
          value={filtro}
          onChange={(e) => {
            setFiltro(e.target.value);
            cargarSinFoto(e.target.value);
          }}
          placeholder="Filtrar por nombre"
          aria-label="Filtrar catálogo sin foto"
          className="h-10 rounded-control border border-border bg-surface px-3 text-[14px] focus:border-primary focus:outline-none"
        />
        {sinFoto.length === 0 ? (
          <p className="text-[13px] text-text-2">Todo el catálogo tiene foto.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {sinFoto.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-2 rounded-card border border-border bg-surface p-3">
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-[14px] font-semibold">{e.nombre}</span>
                  <span className="text-[12px] text-text-2">
                    {e.marca ? `${e.marca} · ` : ""}
                    {e.tiendas} tienda{e.tiendas !== 1 ? "s" : ""}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setBuscador({ texto: e.nombre, destino: { catalogoId: e.id }, entradaId: e.id })}
                  className="press flex-shrink-0 rounded-control border border-border px-3 py-2 text-[12px] font-semibold"
                >
                  Buscar foto
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <BuscadorFotos
        abierto={buscador !== null}
        textoInicial={buscador?.texto ?? ""}
        destino={buscador?.destino ?? null}
        titulo={buscador?.destino ? "Foto del catálogo" : "Buscar y aprobar"}
        onUsada={() => {
          const id = buscador?.entradaId;
          if (id) {
            setSinFoto((prev) => prev.filter((x) => x.id !== id));
            setTotalSinFoto((t) => Math.max(0, t - 1));
          }
        }}
        onCerrar={() => {
          setBuscador(null);
          cargarPendientes();
        }}
      />
    </div>
  );
}
