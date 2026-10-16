"use client";

import { useState, type FormEvent } from "react";
import { apiDelete, apiPatch, ApiError } from "@/lib/api-client";
import type { UnidadMedida } from "@/lib/productos/unidades";
import { PERMISOS, type Permiso } from "@/lib/equipo/permisos";

// Editar o eliminar un producto de la tienda (03-productos.md): precio, oferta, stock,
// disponible y descripción. Eliminar es una baja real: deja de verse en todos lados,
// pero las ventas y pedidos viejos lo conservan en su detalle.
export interface ProductoEditable {
  id: string;
  nombre: string;
  descripcion?: string | null;
  precio: number;
  precioOferta: number | null;
  stock: number;
  unidad: UnidadMedida;
  disponible: boolean;
}

const claseInput =
  "h-11 w-full min-w-0 rounded-control border border-border bg-surface px-3 text-[14px] focus:border-primary focus:outline-none disabled:bg-placeholder disabled:text-text-2";

function numero(texto: string): number {
  return Number(texto.replace(",", "."));
}

export function DialogoEditarProducto<T extends ProductoEditable>({
  producto,
  onGuardado,
  onEliminado,
  onCerrar,
  permisos = PERMISOS.slice(),
}: {
  producto: T;
  // Permisos del equipo (19-equipo-tienda.md): cada campo se edita solo con el suyo.
  permisos?: Permiso[];
  onGuardado: (producto: T) => void;
  onEliminado: (id: string) => void;
  onCerrar: () => void;
}) {
  const [precio, setPrecio] = useState(String(producto.precio));
  const [oferta, setOferta] = useState(producto.precioOferta === null ? "" : String(producto.precioOferta));
  const [stock, setStock] = useState(String(producto.stock));
  const [disponible, setDisponible] = useState(producto.disponible);
  const [descripcion, setDescripcion] = useState(producto.descripcion ?? "");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const puedePrecios = permisos.includes("precios");
  const puedeStock = permisos.includes("stock");
  const puedeProductos = permisos.includes("productos");

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      // Solo se mandan los campos que habilitan los permisos: el servidor exige el
      // permiso de cada campo que llega.
      const actualizado = await apiPatch<T>(`/api/productos/${producto.id}`, {
        ...(puedePrecios ? { precio: numero(precio), precioOferta: oferta.trim() ? numero(oferta) : null } : {}),
        ...(puedeStock ? { stock: numero(stock) } : {}),
        ...(puedeProductos ? { disponible, descripcion: descripcion.trim() || undefined } : {}),
      });
      onGuardado(actualizado);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar el producto.");
    } finally {
      setEnviando(false);
    }
  }

  async function eliminar() {
    if (!window.confirm(`¿Eliminar "${producto.nombre}" de tu tienda? Las ventas anteriores lo conservan en su detalle.`)) return;
    setEnviando(true);
    setError(null);
    try {
      await apiDelete(`/api/productos/${producto.id}`);
      onEliminado(producto.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo eliminar el producto.");
      setEnviando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-text/40 p-4 sm:items-center" role="presentation" onClick={onCerrar}>
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="editar-producto-titulo"
        onClick={(e) => e.stopPropagation()}
        onSubmit={guardar}
        className="flex max-h-[90vh] w-full max-w-md animate-slide-up flex-col gap-3 overflow-y-auto rounded-card bg-surface p-5 shadow-float"
      >
        <h2 id="editar-producto-titulo" className="font-display text-[19px] font-bold text-primary-dark">
          {producto.nombre}
        </h2>
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
          <label className="flex flex-col gap-1 text-[12px] font-semibold text-text-2">
            {producto.unidad === "kg" ? "Precio por kg" : "Precio"}
            <input value={precio} onChange={(e) => setPrecio(e.target.value)} inputMode="decimal" required disabled={!puedePrecios} className={claseInput} />
          </label>
          <label className="flex flex-col gap-1 text-[12px] font-semibold text-text-2">
            Precio de oferta
            <input
              value={oferta}
              onChange={(e) => setOferta(e.target.value)}
              inputMode="decimal"
              placeholder="Sin oferta"
              disabled={!puedePrecios}
              className={claseInput}
            />
          </label>
          <label className="flex flex-col gap-1 text-[12px] font-semibold text-text-2">
            {producto.unidad === "kg" ? "Stock (kg)" : "Stock"}
            <input value={stock} onChange={(e) => setStock(e.target.value)} inputMode="decimal" required disabled={!puedeStock} className={claseInput} />
          </label>
          <label className="flex items-end gap-2 pb-3 text-[13px] font-semibold text-text">
            <input
              type="checkbox"
              checked={disponible}
              onChange={(e) => setDisponible(e.target.checked)}
              disabled={!puedeProductos}
              className="h-5 w-5 accent-[#0e6b5c]"
            />
            Disponible para vender
          </label>
        </div>
        <label className="flex flex-col gap-1 text-[12px] font-semibold text-text-2">
          Descripción (opcional)
          <input
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            maxLength={200}
            disabled={!puedeProductos}
            className={claseInput}
          />
        </label>
        {error && <p className="text-[13px] text-estado-rechazado-text">{error}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={onCerrar} className="press h-12 flex-1 rounded-control border border-border bg-surface text-[15px] font-semibold">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={enviando}
            className="press h-12 flex-1 rounded-control bg-primary text-[15px] font-semibold text-white disabled:opacity-50"
          >
            {enviando ? "Guardando..." : "Guardar"}
          </button>
        </div>
        {puedeProductos && (
          <button
            type="button"
            onClick={eliminar}
            disabled={enviando}
            className="press h-11 rounded-control text-[14px] font-semibold text-estado-rechazado-text disabled:opacity-50"
          >
            Eliminar producto
          </button>
        )}
      </form>
    </div>
  );
}
