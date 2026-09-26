"use client";

import { useEffect, useRef, useState } from "react";

// Diálogo modal para pedir o cambiar un nombre (listas de compras).
export function DialogoNombre({
  abierto,
  titulo,
  descripcion,
  valorInicial,
  textoConfirmar,
  textoCancelar = "Cancelar",
  onConfirmar,
  onCancelar,
  onCerrar,
}: {
  abierto: boolean;
  titulo: string;
  descripcion?: string;
  valorInicial: string;
  textoConfirmar: string;
  textoCancelar?: string;
  onConfirmar: (nombre: string) => void;
  onCancelar: () => void;
  // Tocar afuera o Escape: cierra sin hacer nada (default: onCancelar).
  onCerrar?: () => void;
}) {
  const [valor, setValor] = useState(valorInicial);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!abierto) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- se re-inicializa al abrir
    setValor(valorInicial);
    const id = setTimeout(() => input.current?.select(), 50);
    return () => clearTimeout(id);
  }, [abierto, valorInicial]);

  if (!abierto) return null;
  const limpio = valor.trim();
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-text/40 p-4 sm:items-center" role="presentation" onClick={onCerrar ?? onCancelar} onKeyDown={(e) => e.key === "Escape" && (onCerrar ?? onCancelar)()}>
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialogo-nombre-titulo"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (limpio) onConfirmar(limpio);
        }}
        className="flex w-full max-w-md animate-slide-up flex-col gap-3 rounded-card bg-surface p-5 shadow-float"
      >
        <h2 id="dialogo-nombre-titulo" className="font-display text-[20px] font-bold text-primary-dark">
          {titulo}
        </h2>
        {descripcion && <p className="text-[13px] text-text-2">{descripcion}</p>}
        <input
          ref={input}
          value={valor}
          maxLength={80}
          onChange={(e) => setValor(e.target.value)}
          aria-label="Nombre"
          className="h-12 rounded-control border border-border bg-surface px-4 text-[15px] focus:border-primary focus:outline-none"
        />
        <div className="flex gap-2">
          <button type="button" onClick={onCancelar} className="press h-12 flex-1 rounded-control border border-border bg-surface text-[15px] font-semibold">
            {textoCancelar}
          </button>
          <button type="submit" disabled={!limpio} className="press h-12 flex-1 rounded-control bg-primary text-[15px] font-semibold text-white disabled:opacity-50">
            {textoConfirmar}
          </button>
        </div>
      </form>
    </div>
  );
}
