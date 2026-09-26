"use client";

import { useEffect } from "react";

// Aviso breve anclado abajo (M3 Snackbar). Se cierra solo a los `duracionMs`.
export function Toast({ mensaje, onCerrar, duracionMs = 3500 }: { mensaje: string | null; onCerrar: () => void; duracionMs?: number }) {
  useEffect(() => {
    if (!mensaje) return;
    const id = setTimeout(onCerrar, duracionMs);
    return () => clearTimeout(id);
  }, [mensaje, onCerrar, duracionMs]);

  if (!mensaje) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-5">
      <div
        role="status"
        className="pointer-events-auto animate-slide-up rounded-control bg-text px-4 py-3 text-[14px] font-semibold text-white shadow-float"
      >
        {mensaje}
      </div>
    </div>
  );
}
