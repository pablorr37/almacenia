"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiGet } from "@/lib/api-client";
import { useAlVolver } from "@/lib/hooks/useAlVolver";

// Campanita con el contador de no leídas (22-notificaciones.md); lleva a /notificaciones.
export function Campanita({ className = "" }: { className?: string }) {
  const [cantidad, setCantidad] = useState<number | null>(null);
  const cargar = useCallback(() => {
    apiGet<{ cantidad: number }>("/api/notificaciones/no-leidas")
      .then((r) => setCantidad(r.cantidad))
      .catch(() => {});
  }, []);
  useEffect(() => {
    cargar();
  }, [cargar]);
  useAlVolver(cargar);

  if (cantidad === null) return null;
  const etiqueta = cantidad === 0 ? "Notificaciones" : `Notificaciones: ${cantidad} sin leer`;
  return (
    <Link
      href="/notificaciones"
      aria-label={etiqueta}
      className={`press relative flex h-11 w-11 items-center justify-center rounded-pill border border-border bg-surface/95 text-text shadow-card ${className}`}
    >
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0" />
      </svg>
      {cantidad > 0 && (
        <span
          data-testid="contador-notificaciones"
          className="absolute -right-1 -top-1 flex h-5 min-w-5 animate-scale-in items-center justify-center rounded-pill bg-accent px-1 text-[11px] font-bold text-white tabular-nums"
        >
          {cantidad > 99 ? "99+" : cantidad}
        </span>
      )}
    </Link>
  );
}
