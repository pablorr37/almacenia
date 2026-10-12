"use client";

import { useState, type FormEvent } from "react";
import { ApiError } from "@/lib/api-client";
import type { UnidadMedida } from "@/lib/productos/unidades";

// Sumar al catálogo compartido un producto que no está (06-catalogo.md): lo usa el
// editor de listas cuando la búsqueda no encuentra lo que el comprador quiere.
export type ProductoNuevo = {
  id: string;
  nombre: string;
  marca: string | null;
  imagenUrl: string | null;
  unidad: UnidadMedida;
};

const RUBROS: Array<{ valor: string; etiqueta: string }> = [
  { valor: "", etiqueta: "Rubro (opcional)" },
  { valor: "almacen", etiqueta: "Almacén" },
  { valor: "verduleria", etiqueta: "Verdulería" },
  { valor: "kiosco", etiqueta: "Kiosco" },
  { valor: "panaderia", etiqueta: "Panadería" },
  { valor: "fiambreria", etiqueta: "Fiambrería" },
];

export function DialogoNuevoProducto({
  nombreInicial,
  onCreado,
  onCerrar,
}: {
  nombreInicial: string;
  onCreado: (producto: ProductoNuevo) => void;
  onCerrar: () => void;
}) {
  const [nombre, setNombre] = useState(nombreInicial);
  const [marca, setMarca] = useState("");
  const [categoria, setCategoria] = useState("");
  const [unidad, setUnidad] = useState<UnidadMedida>("unidad");
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
        body: JSON.stringify({ nombre, marca: marca || undefined, categoria: categoria || undefined, unidad }),
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
        className="flex w-full max-w-md animate-slide-up flex-col gap-3 rounded-card bg-surface p-5 shadow-float"
      >
        <h2 id="nuevo-producto-titulo" className="font-display text-[20px] font-bold text-primary-dark">
          Agregar al catálogo
        </h2>
        <p className="text-[13px] text-text-2">
          Queda disponible para todos: las tiendas lo pueden cargar y vas a poder comparar precios cuando alguna lo venda.
        </p>
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          maxLength={80}
          required
          aria-label="Nombre del producto"
          placeholder="Nombre (ej. Fernet Branca 750ml)"
          className="h-11 rounded-control border border-border bg-surface px-3.5 text-[14px] focus:border-primary focus:outline-none"
        />
        <input
          value={marca}
          onChange={(e) => setMarca(e.target.value)}
          maxLength={60}
          aria-label="Marca"
          placeholder="Marca (opcional)"
          className="h-11 rounded-control border border-border bg-surface px-3.5 text-[14px] focus:border-primary focus:outline-none"
        />
        <select
          value={categoria}
          onChange={(e) => setCategoria(e.target.value)}
          aria-label="Rubro"
          className="h-11 rounded-control border border-border bg-surface px-3 text-[14px]"
        >
          {RUBROS.map((r) => (
            <option key={r.valor} value={r.valor}>
              {r.etiqueta}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-2 text-[13px]" role="radiogroup" aria-label="Se vende por">
          <span className="text-text-2">Se vende por</span>
          {(["unidad", "kg"] as const).map((u) => (
            <button
              key={u}
              type="button"
              role="radio"
              aria-checked={unidad === u}
              onClick={() => setUnidad(u)}
              className={`press rounded-pill px-3 py-1.5 font-semibold ${
                unidad === u ? "bg-primary text-white" : "border border-border bg-surface text-text"
              }`}
            >
              {u === "unidad" ? "unidad" : "kg (peso)"}
            </button>
          ))}
        </div>
        {error && <p className="text-[13px] text-estado-rechazado-text">{error}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={onCerrar} className="press h-12 flex-1 rounded-control border border-border bg-surface text-[15px] font-semibold">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={enviando || nombre.trim().length < 2}
            className="press h-12 flex-1 rounded-control bg-primary text-[15px] font-semibold text-white disabled:opacity-50"
          >
            {enviando ? "Agregando..." : "Agregar a la lista"}
          </button>
        </div>
      </form>
    </div>
  );
}
