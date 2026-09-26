"use client";

import { formatearCantidad, pasoDe, redondearCantidad, type UnidadMedida } from "@/lib/productos/unidades";

// Atajos para productos por kg (03-productos.md, "Cantidades y unidades").
const ATAJOS_KG = [0.1, 0.25, 0.5, 1];
// Primer toque de "+" en un producto por kg: un cuarto kilo.
const INICIAL_KG = 0.25;

// Cantidad de un producto: stepper de a 1 para "unidad"; para "kg", stepper de a
// 50 g y atajos 100 g / 250 g / 500 g / 1 kg. `max` = stock disponible (opcional).
export function SelectorCantidad({
  unidad,
  valor,
  onChange,
  max,
  nombre,
}: {
  unidad: UnidadMedida;
  valor: number;
  onChange: (valor: number) => void;
  max?: number;
  nombre: string;
}) {
  const paso = pasoDe(unidad);
  const tope = (v: number) => (max === undefined ? v : Math.min(v, max));
  const cambiar = (v: number) => onChange(Math.max(0, redondearCantidad(unidad, tope(v))));
  const puedeSumar = max === undefined || valor + paso <= max + 1e-9;

  if (valor <= 0) {
    return (
      <button
        type="button"
        onClick={() => cambiar(unidad === "kg" ? INICIAL_KG : 1)}
        disabled={max !== undefined && max < paso}
        aria-label={`Agregar ${nombre}`}
        className="press flex h-11 w-11 flex-shrink-0 animate-scale-in items-center justify-center rounded-control bg-primary text-white disabled:opacity-40"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M8 1V15M1 8H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
    );
  }

  return (
    <div className="flex flex-shrink-0 animate-scale-in flex-col items-end gap-1.5">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => cambiar(valor - paso)}
          aria-label={valor - paso <= 0 ? `Quitar ${nombre}` : `Menos ${nombre}`}
          className="press flex h-10 w-10 items-center justify-center rounded-control border border-border bg-surface text-lg leading-none"
        >
          {valor - paso <= 0 ? "×" : "–"}
        </button>
        <span className="min-w-[52px] text-center text-[14px] font-semibold tabular-nums" aria-live="polite">
          {unidad === "kg" ? formatearCantidad("kg", valor) : valor}
        </span>
        <button
          type="button"
          onClick={() => cambiar(valor + paso)}
          disabled={!puedeSumar}
          aria-label={`Más ${nombre}`}
          className="press flex h-10 w-10 items-center justify-center rounded-control bg-primary text-lg leading-none text-white disabled:opacity-40"
        >
          +
        </button>
      </div>
      {unidad === "kg" && (
        <div className="flex gap-1" role="group" aria-label={`Cantidad rápida de ${nombre}`}>
          {ATAJOS_KG.filter((a) => max === undefined || a <= max + 1e-9).map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => cambiar(a)}
              aria-pressed={Math.abs(valor - a) < 1e-9}
              className={`press rounded-pill px-2 py-1 text-[11px] font-semibold ${
                Math.abs(valor - a) < 1e-9 ? "bg-primary text-white" : "border border-border bg-surface text-text"
              }`}
            >
              {formatearCantidad("kg", a)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
