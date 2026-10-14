"use client";

import { useState } from "react";
import { formatearCantidad, pasoDe, pesoPorImporte, redondearCantidad, type UnidadMedida } from "@/lib/productos/unidades";

// Atajos para productos por kg (03-productos.md, "Cantidades y unidades").
const ATAJOS_KG = [0.1, 0.25, 0.5, 1];
// Primer toque de "+" en un producto por kg: un cuarto kilo.
const INICIAL_KG = 0.25;

const formatoARS = (n: number) =>
  "$" + n.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

// Cantidad de un producto: stepper de a 1 para "unidad"; para "kg", stepper de a
// 50 g, atajos 100 g / 250 g / 500 g / 1 kg y, si se pasa `precio` (por kg), la
// opción "$ Importe": se escribe un monto y se fija el peso equivalente
// (pesoPorImporte, redondeado a 1 g). `max` = stock disponible (opcional).
export function SelectorCantidad({
  unidad,
  valor,
  onChange,
  max,
  nombre,
  precio,
}: {
  unidad: UnidadMedida;
  valor: number;
  onChange: (valor: number) => void;
  max?: number;
  nombre: string;
  precio?: number;
}) {
  const [porImporte, setPorImporte] = useState(false);
  const [importe, setImporte] = useState("");
  const paso = pasoDe(unidad);
  const tope = (v: number) => (max === undefined ? v : Math.min(v, max));
  const cambiar = (v: number) => onChange(Math.max(0, redondearCantidad(unidad, tope(v))));
  const puedeSumar = max === undefined || valor + paso <= max + 1e-9;
  const aceptaImporte = unidad === "kg" && precio !== undefined && precio > 0;

  const importeNumero = Number(importe.replace(",", "."));
  const pesoCalculado = aceptaImporte ? pesoPorImporte(importeNumero, precio ?? 0) : 0;
  const pesoFinal = max === undefined ? pesoCalculado : Math.min(pesoCalculado, max);

  function escribirImporte(texto: string) {
    setImporte(texto);
    const kg = aceptaImporte ? pesoPorImporte(Number(texto.replace(",", ".")), precio ?? 0) : 0;
    if (kg > 0) cambiar(kg);
  }

  const botonImporte = aceptaImporte ? (
    <button
      type="button"
      onClick={() => setPorImporte((v) => !v)}
      aria-pressed={porImporte}
      aria-label={`Cargar ${nombre} por importe`}
      className={`press flex h-10 flex-shrink-0 items-center rounded-control px-2.5 text-[12px] font-semibold ${
        porImporte ? "bg-primary text-white" : "border border-border bg-surface text-text"
      }`}
    >
      $ Importe
    </button>
  ) : null;

  const campoImporte =
    aceptaImporte && porImporte ? (
      <div className="flex items-center gap-1.5">
        <input
          autoFocus
          value={importe}
          onChange={(e) => escribirImporte(e.target.value)}
          inputMode="decimal"
          placeholder="$ monto"
          aria-label={`Importe de ${nombre}`}
          className="h-9 w-24 rounded-control border border-border bg-surface px-2.5 text-[13px] focus:border-primary focus:outline-none"
        />
        <span className="text-[12px] font-semibold text-text-2" data-testid="peso-por-importe">
          {pesoFinal > 0 ? `= ${formatearCantidad("kg", pesoFinal)}` : `a ${formatoARS(precio ?? 0)}/kg`}
        </span>
      </div>
    ) : null;

  if (valor <= 0) {
    return (
      <div className="flex flex-shrink-0 flex-col items-end gap-1.5">
        <div className="flex items-center gap-1.5">
          {botonImporte}
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
        </div>
        {campoImporte}
      </div>
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
        <div className="flex flex-wrap justify-end gap-1" role="group" aria-label={`Cantidad rápida de ${nombre}`}>
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
          {botonImporte && (
            <button
              type="button"
              onClick={() => setPorImporte((v) => !v)}
              aria-pressed={porImporte}
              aria-label={`Cargar ${nombre} por importe`}
              className={`press rounded-pill px-2 py-1 text-[11px] font-semibold ${
                porImporte ? "bg-primary text-white" : "border border-border bg-surface text-text"
              }`}
            >
              $ Importe
            </button>
          )}
        </div>
      )}
      {campoImporte}
    </div>
  );
}
