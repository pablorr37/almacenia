"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiGet, apiPost, ApiError } from "@/lib/api-client";

type Tienda = {
  id: string;
  nombre: string;
  direccion: string;
};

type Producto = {
  id: string;
  nombre: string;
  precio: number;
  stock: number;
};

const formatoARS = (n: number) =>
  "$" + n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function TiendaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [tienda, setTienda] = useState<Tienda | null>(null);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    apiGet<Tienda>(`/api/tiendas/${id}`).then(setTienda).catch(() => {});
    apiGet<Producto[]>(`/api/tiendas/${id}/productos?soloDisponibles=true`)
      .then(setProductos)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Error al cargar el catálogo."));
  }, [id]);

  const cantidadItems = Object.values(cart).reduce((a, b) => a + b, 0);
  const total = productos.reduce((sum, p) => sum + (cart[p.id] ?? 0) * p.precio, 0);

  function agregar(p: Producto) {
    const actual = cart[p.id] ?? 0;
    if (actual >= p.stock) return;
    setCart({ ...cart, [p.id]: actual + 1 });
  }

  function quitar(p: Producto) {
    const actual = cart[p.id] ?? 0;
    setCart({ ...cart, [p.id]: Math.max(0, actual - 1) });
  }

  async function confirmarPedido() {
    setError(null);
    setEnviando(true);
    try {
      const items = Object.entries(cart)
        .filter(([, cantidad]) => cantidad > 0)
        .map(([productoId, cantidad]) => ({ productoId, cantidad }));
      const pedido = await apiPost<{ id: string }>("/api/pedidos", { tiendaId: id, items });
      router.push(`/pedidos/${pedido.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo confirmar el pedido.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="relative mx-auto flex min-h-screen max-w-md flex-col bg-bg">
      <div className="flex items-center gap-3 px-5 pb-1 pt-5">
        <Link href="/" aria-label="Volver al mapa" className="flex h-8 w-8 items-center justify-center">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#201A15" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </Link>
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="font-display text-[17px] font-bold text-primary-dark">
            {tienda?.nombre ?? "Cargando..."}
          </div>
          <div className="text-[13px] text-text-2">{tienda?.direccion}</div>
        </div>
      </div>

      <div className="flex flex-grow flex-col gap-2.5 overflow-y-auto px-5 py-4">
        {error && <p className="text-[13px] text-estado-rechazado-text">{error}</p>}
        {productos.map((p) => {
          const qty = cart[p.id] ?? 0;
          return (
            <div
              key={p.id}
              className="flex items-center gap-3 rounded-card border border-border bg-surface p-3.5 shadow-[0_1px_3px_rgba(32,26,21,0.05)]"
            >
              <div className="h-13 w-13 flex-shrink-0 rounded-control bg-placeholder" style={{ width: 52, height: 52 }} />
              <div className="flex min-w-0 flex-grow flex-col gap-0.5">
                <div className="text-[15px] font-semibold">{p.nombre}</div>
                <div className="text-[13px] text-text-2">
                  {formatoARS(p.precio)} · {p.stock} disponibles
                </div>
              </div>
              {qty > 0 ? (
                <div className="flex flex-shrink-0 items-center gap-2">
                  <button
                    onClick={() => quitar(p)}
                    aria-label="Quitar uno"
                    className="flex h-7 w-7 items-center justify-center rounded-control border border-border bg-surface text-base leading-none"
                  >
                    –
                  </button>
                  <span className="min-w-[14px] text-center text-sm font-semibold">{qty}</span>
                  <button
                    onClick={() => agregar(p)}
                    aria-label="Agregar uno"
                    className="flex h-7 w-7 items-center justify-center rounded-control bg-primary text-base leading-none text-white"
                  >
                    +
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => agregar(p)}
                  aria-label="Agregar al pedido"
                  className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-control bg-primary text-lg leading-none text-white"
                >
                  +
                </button>
              )}
            </div>
          );
        })}
      </div>

      {cantidadItems > 0 && (
        <div className="sticky bottom-0 border-t border-border bg-surface px-5 pb-6 pt-3.5">
          <button
            onClick={confirmarPedido}
            disabled={enviando}
            className="flex w-full items-center justify-between rounded-control bg-primary px-5 py-4 text-[15px] font-semibold text-white shadow-[0_4px_12px_rgba(14,107,92,0.25)] disabled:opacity-60"
          >
            <span>{enviando ? "Enviando..." : `Confirmar pedido (${cantidadItems})`}</span>
            <span>{formatoARS(total)}</span>
          </button>
        </div>
      )}
    </div>
  );
}
