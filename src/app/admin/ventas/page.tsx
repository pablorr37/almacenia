"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { apiGet, ApiError } from "@/lib/api-client";

type ItemVenta = {
  id: string;
  productoId: string;
  productoNombre: string;
  cantidad: number;
  precioUnitario: number;
};

type VentaAdmin = {
  id: string;
  tiendaNombre: string;
  origen: "presencial" | "pedido";
  total: number;
  items: ItemVenta[];
};

const formatoARS = (n: number) =>
  "$" + n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function AdminVentasPage() {
  const { status } = useSession();
  const [ventas, setVentas] = useState<VentaAdmin[]>([]);
  const [expandida, setExpandida] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "authenticated") return;
    apiGet<VentaAdmin[]>("/api/admin/ventas")
      .then(setVentas)
      .catch((err) => {
        if (err instanceof ApiError && err.code === "FORBIDDEN") {
          setForbidden(true);
        } else {
          setError(err instanceof ApiError ? err.message : "No se pudieron cargar las ventas.");
        }
      });
  }, [status]);

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

  if (forbidden) {
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
    <div className="mx-auto flex min-h-screen max-w-md flex-col gap-5 px-6 py-8">
      <div className="flex items-center gap-3">
        <Link href="/admin" aria-label="Volver al panel" className="flex h-8 w-8 items-center justify-center">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#201A15" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </Link>
        <h1 className="font-display text-[20px] font-bold text-primary-dark">Ventas</h1>
      </div>

      {error && <p className="text-[13px] text-estado-rechazado-text">{error}</p>}

      <div className="flex flex-col gap-2.5">
        {ventas.length === 0 && !error && (
          <p className="py-6 text-center text-[13px] text-text-2">No hay ventas registradas.</p>
        )}
        {ventas.map((v) => {
          const abierta = expandida === v.id;
          return (
            <div key={v.id} className="rounded-card border border-border bg-surface">
              <button
                onClick={() => setExpandida(abierta ? null : v.id)}
                className="flex w-full items-center justify-between p-3.5 text-left"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-[14px] font-semibold">{v.tiendaNombre}</span>
                  <span className="text-[12px] text-text-2">
                    {v.origen === "presencial" ? "Venta presencial" : "Desde pedido"} · {v.items.length} ítem
                    {v.items.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <span className="text-[14px] font-semibold">{formatoARS(v.total)}</span>
              </button>
              {abierta && (
                <div className="flex flex-col gap-1.5 border-t border-border px-3.5 pb-3.5 pt-2.5">
                  {v.items.map((item) => (
                    <div key={item.id} className="flex justify-between gap-2 text-[13px] text-text-2">
                      <span className="min-w-0 flex-grow truncate">
                        {item.productoNombre} · {item.cantidad} × {formatoARS(item.precioUnitario)}
                      </span>
                      <span className="flex-shrink-0">{formatoARS(item.cantidad * item.precioUnitario)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
