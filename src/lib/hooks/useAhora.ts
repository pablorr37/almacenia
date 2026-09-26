"use client";

import { useEffect, useState } from "react";

// Hora actual que se refresca cada `intervaloMs` (default 1 min), para que los
// estados "Abierto/Cerrado" se actualicen solos si la pantalla queda abierta.
export function useAhora(intervaloMs = 60_000): Date {
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setAhora(new Date()), intervaloMs);
    return () => clearInterval(id);
  }, [intervaloMs]);
  return ahora;
}
