"use client";

import { useEffect, useRef, useState } from "react";

// Anima un número desde el valor anterior hasta `objetivo` (ease-out, ~600ms).
// Con prefers-reduced-motion salta directo al valor final.
export function useConteo(objetivo: number, duracionMs = 600): number {
  const [valor, setValor] = useState(0);
  const desde = useRef(0);

  useEffect(() => {
    const reducir = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const inicio = desde.current;
    if (reducir || inicio === objetivo) {
      desde.current = objetivo;
      const id = requestAnimationFrame(() => setValor(objetivo));
      return () => cancelAnimationFrame(id);
    }
    const t0 = performance.now();
    let frame = 0;
    const paso = (t: number) => {
      const p = Math.min(1, (t - t0) / duracionMs);
      const e = 1 - Math.pow(1 - p, 3);
      setValor(inicio + (objetivo - inicio) * e);
      if (p < 1) frame = requestAnimationFrame(paso);
      else desde.current = objetivo;
    };
    frame = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(frame);
  }, [objetivo, duracionMs]);

  return valor;
}
