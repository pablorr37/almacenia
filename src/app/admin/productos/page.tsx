"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { apiGet, ApiError } from "@/lib/api-client";

type ProductoAdmin = {
  id: string;
  nombre: string;
  precio: number;
  stock: number;
  disponible: boolean;
  categoria: string | null;
  tiendaNombre: string;
  vendedorNombre: string;
};

const formatoARS = (n: number) =>
  "$" + n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function AdminProductosContent() {
  const { status } = useSession();
  const searchParams = useSearchParams();
  const tiendaIdInicial = searchParams.get("tiendaId") ?? "";

  const [productos, setProductos] = useState<ProductoAdmin[]>([]);
  const [q, setQ] = useState("");
  const [tiendaId, setTiendaId] = useState(tiendaIdInicial);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "authenticated") return;
    const sp = new URLSearchParams();
    if (q.trim()) sp.set("q", q.trim());
    if (tiendaId) sp.set("tiendaId", tiendaId);

    apiGet<ProductoAdmin[]>(`/api/admin/productos?${sp.toString()}`)
      .then(setProductos)
      .catch((err) => {
        if (err instanceof ApiError && err.code === "FORBIDDEN") {
          setForbidden(true);
        } else {
          setError(err instanceof ApiError ? err.message : "No se pudieron cargar los productos.");
        }
      });
  }, [status, q, tiendaId]);

  if (status === "unauthenticated") {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-text-2">Necesitás iniciar sesión.</p>
        <Link href="/login" className="font-semibold text-accent">
          Iniciar sesión
        </Link>
      </div>
    );
  }

  if (forbidden) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="text-text-2">Esta sección es solo para administradores.</p>
        <Link href="/" className="font-semibold text-accent">
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
        <h1 className="font-display text-[20px] font-bold text-primary-dark">Productos</h1>
      </div>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar producto..."
        className="rounded-control border border-border bg-surface px-3.5 py-2.5 text-[14px] placeholder:text-text-2 focus:outline-none focus:border-primary"
      />

      {tiendaId && (
        <div className="flex items-center justify-between rounded-control bg-placeholder px-3 py-2 text-[12px] text-text-2">
          <span>Filtrando por una tienda</span>
          <button onClick={() => setTiendaId("")} className="font-semibold text-accent">
            Quitar filtro
          </button>
        </div>
      )}

      {error && <p className="text-[13px] text-estado-rechazado-text">{error}</p>}

      <div className="flex flex-col gap-2.5">
        {productos.length === 0 && !error && (
          <p className="py-6 text-center text-[13px] text-text-2">No hay productos con estos filtros.</p>
        )}
        {productos.map((p) => (
          <div key={p.id} className="flex flex-col gap-1 rounded-card border border-border bg-surface p-3.5">
            <div className="flex items-center justify-between">
              <span className="text-[14px] font-semibold">{p.nombre}</span>
              <span className="text-[14px] font-semibold">{formatoARS(p.precio)}</span>
            </div>
            <div className="text-[12px] text-text-2">
              {p.tiendaNombre} · {p.vendedorNombre}
            </div>
            <div className="flex items-center gap-2 text-[12px] text-text-2">
              <span>Stock: {p.stock}</span>
              {p.categoria && <span>· {p.categoria}</span>}
              {!p.disponible && <span className="font-semibold text-estado-rechazado-text">· Pausado</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AdminProductosPage() {
  return (
    <Suspense fallback={null}>
      <AdminProductosContent />
    </Suspense>
  );
}
