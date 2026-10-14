"use client";

import { useState, type FormEvent } from "react";
import { ApiError } from "@/lib/api-client";
import type { UnidadMedida } from "@/lib/productos/unidades";
import {
  CamposEntradaCatalogo,
  ENTRADA_VACIA,
  aNuevaEntrada,
  type EntradaCatalogoForm,
} from "@/components/catalogo/CamposEntradaCatalogo";

// Sumar al catálogo compartido un producto que no está (06-catalogo.md): lo usa el
// editor de listas cuando la búsqueda no encuentra lo que el comprador quiere. Se
// elige la categoría (lista del admin) y se completan marca, variante y contenido.
export type ProductoNuevo = {
  id: string;
  nombre: string;
  marca: string | null;
  imagenUrl: string | null;
  unidad: UnidadMedida;
};

export function DialogoNuevoProducto({
  nombreInicial,
  onCreado,
  onCerrar,
}: {
  nombreInicial: string;
  onCreado: (producto: ProductoNuevo) => void;
  onCerrar: () => void;
}) {
  const [entrada, setEntrada] = useState<EntradaCatalogoForm>(ENTRADA_VACIA);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch("/api/catalogo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(aNuevaEntrada(entrada)),
      });
      const body = await res.json();
      if (!res.ok) throw new ApiError(body.error?.code ?? "ERROR", body.error?.message ?? "No se pudo agregar.");
      onCreado(body.data as ProductoNuevo);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo agregar el producto.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-text/40 p-4 sm:items-center" role="presentation" onClick={onCerrar}>
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="nuevo-producto-titulo"
        onClick={(e) => e.stopPropagation()}
        onSubmit={enviar}
        className="flex max-h-[90vh] w-full max-w-md animate-slide-up flex-col gap-3 overflow-y-auto rounded-card bg-surface p-5 shadow-float"
      >
        <h2 id="nuevo-producto-titulo" className="font-display text-[20px] font-bold text-primary-dark">
          Agregar al catálogo
        </h2>
        <p className="text-[13px] text-text-2">
          Queda disponible para todos: las tiendas lo pueden cargar y vas a poder comparar precios cuando alguna lo venda.
        </p>
        <CamposEntradaCatalogo valor={entrada} onChange={setEntrada} sugerencia={nombreInicial} />
        {error && <p className="text-[13px] text-estado-rechazado-text">{error}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={onCerrar} className="press h-12 flex-1 rounded-control border border-border bg-surface text-[15px] font-semibold">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={enviando || !entrada.categoria}
            className="press h-12 flex-1 rounded-control bg-primary text-[15px] font-semibold text-white disabled:opacity-50"
          >
            {enviando ? "Agregando..." : "Agregar a la lista"}
          </button>
        </div>
      </form>
    </div>
  );
}
