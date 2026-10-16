"use client";

import { useEffect, useRef } from "react";
import { useEscaner } from "@/lib/scanner/useCodigoBarras";

// Escáner a pantalla completa: cámara trasera, recuadro guía, botón Cerrar siempre
// visible (también Escape y el gesto/botón "atrás"), linterna si hay, y tocar la
// imagen reenfoca. Al leer un código vibra, se cierra y devuelve el texto.
export function EscanerCodigo({
  abierto,
  titulo = "Apuntá al código",
  onDetectado,
  onCerrar,
}: {
  abierto: boolean;
  titulo?: string;
  onDetectado: (texto: string) => void;
  onCerrar: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const onCerrarRef = useRef(onCerrar);
  useEffect(() => {
    onCerrarRef.current = onCerrar;
  }, [onCerrar]);

  const { error, listo, linternaDisponible, linternaEncendida, alternarLinterna, enfocar } = useEscaner(videoRef, {
    activo: abierto,
    onDetectado: (texto) => {
      navigator.vibrate?.(80);
      onDetectado(texto);
      onCerrarRef.current();
    },
  });

  // "Atrás" del celular cierra el escáner en vez de salir de la página.
  useEffect(() => {
    if (!abierto) return;
    history.pushState({ escaner: true }, "");
    const alVolver = () => onCerrarRef.current();
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCerrarRef.current();
    };
    window.addEventListener("popstate", alVolver);
    window.addEventListener("keydown", alTeclear);
    return () => {
      window.removeEventListener("popstate", alVolver);
      window.removeEventListener("keydown", alTeclear);
      if (history.state?.escaner) history.back();
    };
  }, [abierto]);

  if (!abierto) return null;

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-black" role="dialog" aria-modal="true" aria-label="Escáner de códigos">
      <video
        ref={videoRef}
        muted
        playsInline
        data-testid="video-escaner"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          enfocar((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
        }}
        className="absolute inset-0 h-full w-full object-cover"
      />

      {/* Recuadro guía */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="h-[38%] w-[78%] max-w-sm rounded-card border-[3px] border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
      </div>

      <div className="relative z-10 flex items-center justify-between gap-3 p-4">
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar escáner"
          className="press flex h-11 items-center gap-1.5 rounded-pill bg-white px-4 text-[14px] font-semibold text-text"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          Cerrar
        </button>
        {linternaDisponible && (
          <button
            type="button"
            onClick={alternarLinterna}
            aria-pressed={linternaEncendida}
            className={`press h-11 rounded-pill px-4 text-[14px] font-semibold ${
              linternaEncendida ? "bg-accent text-white" : "bg-white/90 text-text"
            }`}
          >
            {linternaEncendida ? "Linterna: sí" : "Linterna"}
          </button>
        )}
      </div>

      <div className="relative z-10 mt-auto p-6 text-center">
        {error ? (
          <p className="rounded-control bg-white px-4 py-3 text-[14px] text-estado-rechazado-text">{error}</p>
        ) : (
          <p className="text-[15px] font-semibold text-white drop-shadow">
            {listo ? titulo : "Abriendo la cámara…"}
            {listo && <span className="mt-1 block text-[12px] font-normal text-white/80">Tocá la imagen para enfocar</span>}
          </p>
        )}
      </div>
    </div>
  );
}
