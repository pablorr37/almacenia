"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiGet } from "@/lib/api-client";
import { useConteo } from "@/lib/hooks/useConteo";

export const formatoPuntos = (n: number) =>
  n.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 1 });

// Puntos del usuario en la barra del mapa (12-gamificacion.md); lleva al historial.
export function PuntosChip({ className = "" }: { className?: string }) {
  const [total, setTotal] = useState<number | null>(null);
  const mostrado = useConteo(total ?? 0);

  useEffect(() => {
    apiGet<{ total: number }>("/api/gamificacion/puntos")
      .then((r) => setTotal(r.total))
      .catch(() => {});
  }, []);

  if (total === null) return null;
  return (
    <Link
      href="/perfil/puntos"
      aria-label={`${formatoPuntos(total)} puntos. Ver historial`}
      className={`press flex h-11 animate-scale-in items-center gap-1.5 rounded-pill border border-border bg-surface/95 px-3.5 text-[13px] font-bold text-primary-dark shadow-card ${className}`}
    >
      <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden="true">
        <path className="fill-accent" d="m10 1.8 2.5 5.2 5.7.8-4.1 4 1 5.6L10 14.7l-5.1 2.7 1-5.6-4.1-4 5.7-.8z" />
      </svg>
      <span className="tabular-nums">{formatoPuntos(Math.round(mostrado * 10) / 10)}</span>
    </Link>
  );
}
