"use client";

import { useEffect, useRef } from "react";

// Ejecuta `alVolver` cuando la pestaña vuelve a estar visible (el celular desbloqueado,
// volver desde otra app o pestaña). Así el mapa no queda mostrando tiendas que ya se
// pausaron o borraron mientras estaba en segundo plano (00-overview.md, "Sin caché").
export function useAlVolver(alVolver: () => void): void {
  const ref = useRef(alVolver);
  useEffect(() => {
    ref.current = alVolver;
  }, [alVolver]);

  useEffect(() => {
    const manejar = () => {
      if (document.visibilityState === "visible") ref.current();
    };
    document.addEventListener("visibilitychange", manejar);
    return () => document.removeEventListener("visibilitychange", manejar);
  }, []);
}
