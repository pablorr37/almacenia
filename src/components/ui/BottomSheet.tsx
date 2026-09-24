"use client";

import { useRef, useState, type ReactNode } from "react";

type SnapPoint = "colapsado" | "medio" | "expandido";

const ALTURAS: Record<SnapPoint, number> = {
  colapsado: 0.15,
  medio: 0.45,
  expandido: 0.9,
};

const ORDEN: SnapPoint[] = ["colapsado", "medio", "expandido"];

export function BottomSheet({
  snap,
  onSnapChange,
  header,
  children,
}: {
  snap: SnapPoint;
  onSnapChange: (snap: SnapPoint) => void;
  header?: ReactNode;
  children: ReactNode;
}) {
  const [arrastreY, setArrastreY] = useState<number | null>(null);
  const inicioRef = useRef<{ y: number; alturaVh: number } | null>(null);

  const alturaBaseVh = ALTURAS[snap] * 100;
  const alturaActualVh = arrastreY !== null ? arrastreY : alturaBaseVh;

  function onPointerDown(e: React.PointerEvent) {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    inicioRef.current = { y: e.clientY, alturaVh: alturaBaseVh };
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!inicioRef.current) return;
    const deltaVh = ((inicioRef.current.y - e.clientY) / window.innerHeight) * 100;
    const nuevaAlturaVh = Math.min(95, Math.max(8, inicioRef.current.alturaVh + deltaVh));
    setArrastreY(nuevaAlturaVh);
  }

  function onPointerUp() {
    if (arrastreY === null) {
      inicioRef.current = null;
      return;
    }
    // Snap al punto más cercano en altura.
    let masCercano: SnapPoint = "colapsado";
    let menorDistancia = Infinity;
    for (const punto of ORDEN) {
      const distancia = Math.abs(ALTURAS[punto] * 100 - arrastreY);
      if (distancia < menorDistancia) {
        menorDistancia = distancia;
        masCercano = punto;
      }
    }
    onSnapChange(masCercano);
    setArrastreY(null);
    inicioRef.current = null;
  }

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-10 mx-auto flex max-w-md flex-col rounded-t-[20px] border border-border bg-surface shadow-[0_-4px_20px_rgba(32,26,21,0.12)]"
      style={{
        height: `${alturaActualVh}vh`,
        transition: arrastreY === null ? "height 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)" : "none",
      }}
    >
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className="flex flex-shrink-0 cursor-grab touch-none flex-col items-center gap-2 pb-2 pt-3 active:cursor-grabbing"
      >
        <div className="h-1.5 w-10 rounded-pill bg-border" />
        {header}
      </div>
      <div className="flex-grow overflow-y-auto px-5 pb-6">{children}</div>
    </div>
  );
}
