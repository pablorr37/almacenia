"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { apiGet } from "@/lib/api-client";
import type { EspacioAviso } from "@/lib/publicidad/reglas";

type Aviso = {
  campaniaId: string;
  tipo: "imagen" | "texto";
  imagenUrl: string | null;
  ancho: number | null;
  alto: number | null;
  texto: string | null;
  tienda: { id: string; nombre: string };
  token: string;
};

// Espacio publicitario con alto reservado y etiqueta "Publicidad" (21-publicidad.md).
// Solo free e invitados; nunca en mi-tienda ni junto a botones de acción.
export function EspacioPublicitario({ espacio, lat, lon, className = "" }: { espacio: EspacioAviso; lat?: number; lon?: number; className?: string }) {
  const [estado, setEstado] = useState<{ aviso: Aviso | null; conPublicidad: boolean } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const cuadrado = espacio === "comparar";

  useEffect(() => {
    const q = new URLSearchParams({ espacio });
    if (typeof lat === "number" && typeof lon === "number") {
      q.set("lat", String(lat));
      q.set("lon", String(lon));
    }
    apiGet<{ aviso: Aviso | null; conPublicidad: boolean }>(`/api/avisos?${q}`)
      .then(setEstado)
      .catch(() => setEstado({ aviso: null, conPublicidad: false }));
  }, [espacio, lat, lon]);

  // Impresión visible: 50 % del aviso en pantalla durante 1 s.
  const token = estado?.aviso?.token;
  useEffect(() => {
    const nodo = ref.current;
    if (!token || !nodo || typeof IntersectionObserver === "undefined") return;
    let temporizador: ReturnType<typeof setTimeout> | null = null;
    let enviado = false;
    const observador = new IntersectionObserver(
      ([entrada]) => {
        if (entrada.isIntersecting && !enviado) {
          temporizador = setTimeout(() => {
            enviado = true;
            if (!navigator.sendBeacon?.("/api/avisos/impresion", token)) {
              fetch("/api/avisos/impresion", { method: "POST", body: token, keepalive: true }).catch(() => {});
            }
            observador.disconnect();
          }, 1000);
        } else if (temporizador) {
          clearTimeout(temporizador);
          temporizador = null;
        }
      },
      { threshold: 0.5 }
    );
    observador.observe(nodo);
    return () => {
      if (temporizador) clearTimeout(temporizador);
      observador.disconnect();
    };
  }, [token]);

  if (estado && !estado.conPublicidad) return null;
  const caja = `relative w-full overflow-hidden rounded-card border border-border bg-surface ${cuadrado ? "mx-auto aspect-[6/5] max-w-[300px]" : "aspect-[32/10]"}`;
  const etiqueta = (
    <span className="absolute right-1.5 top-1.5 z-10 rounded-pill bg-text/70 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
      Publicidad
    </span>
  );

  if (!estado) return <div className={`${caja} animate-pulse bg-placeholder ${className}`} aria-hidden="true" />;

  const aviso = estado.aviso;
  if (!aviso) {
    // Aviso de la casa: invita a los comercios a publicitar.
    return (
      <Link
        href="/mi-tienda/publicidad"
        data-testid={`espacio-${espacio}`}
        className={`${caja} press-soft flex flex-col items-center justify-center gap-0.5 border-dashed px-4 text-center ${className}`}
      >
        {etiqueta}
        <span className="text-[14px] font-semibold text-primary-dark">¿Tenés un comercio?</span>
        <span className="text-[12px] text-text-2">Publicitalo acá, con puntos o en pesos.</span>
      </Link>
    );
  }

  return (
    <div ref={ref} className={className} data-testid={`espacio-${espacio}`} data-campania={aviso.campaniaId}>
      <a href={`/api/avisos/clic?token=${encodeURIComponent(aviso.token)}`} rel="sponsored noopener" className={`${caja} press-soft block`}>
        {etiqueta}
        {aviso.tipo === "imagen" && aviso.imagenUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- imagen del bucket con medidas propias
          <img src={aviso.imagenUrl} alt={`Publicidad de ${aviso.tienda.nombre}`} width={aviso.ancho ?? undefined} height={aviso.alto ?? undefined} className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full flex-col justify-center gap-1 bg-gradient-to-br from-primary-soft to-surface px-4">
            <span className="font-display text-[16px] font-bold leading-tight text-primary-dark">{aviso.tienda.nombre}</span>
            <span className="line-clamp-2 text-[13px] text-text">{aviso.texto}</span>
          </span>
        )}
      </a>
    </div>
  );
}
