"use client";

import { useState } from "react";
import { apiPost, ApiError } from "@/lib/api-client";
import { formatearCantidad, pesoPorImporte, type UnidadMedida } from "@/lib/productos/unidades";

// Ajuste de peso de productos por kg (04-pedidos.md, ronda 6).
export type ItemConAjuste = {
  id: string;
  nombre: string;
  unidad: UnidadMedida;
  cantidad: number;
  precioUnitario: number;
  ajusteEstado: "ninguno" | "propuesto" | "rechazado" | "ratificado" | "aceptado" | "quitado";
  cantidadPropuesta: number | null;
  cantidadOriginal: number | null;
};

const pesos = (n: number) => n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 2 });
const ESTADO: Record<ItemConAjuste["ajusteEstado"], string> = {
  ninguno: "",
  propuesto: "Esperando al comprador",
  rechazado: "El comprador no aceptó",
  ratificado: "La tienda mantiene el ajuste",
  aceptado: "Ajuste aceptado",
  quitado: "Quitado del pedido",
};

function Fila<T>({ item, lado, pedidoId, onActualizado }: { item: ItemConAjuste; lado: "tienda" | "comprador"; pedidoId: string; onActualizado: (p: T) => void }) {
  const [modo, setModo] = useState<"peso" | "importe">("peso");
  const [valor, setValor] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const numero = Number(valor.replace(",", "."));
  // Peso en kg: lo escrito en gramos, o el que corresponde al importe.
  const kg = modo === "peso" ? numero / 1000 : pesoPorImporte(numero, item.precioUnitario);

  async function accion(cuerpo: Record<string, unknown>) {
    setOcupado(true);
    setError(null);
    try {
      onActualizado(await apiPost<T>(`/api/pedidos/${pedidoId}/items/${item.id}/ajuste`, cuerpo));
      setValor("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo.");
    } finally {
      setOcupado(false);
    }
  }

  const propuesta = item.cantidadPropuesta;
  const puedeProponer = lado === "tienda" && ["ninguno", "rechazado", "aceptado"].includes(item.ajusteEstado);
  return (
    <li className="flex flex-col gap-2 border-t border-border py-2.5 first:border-t-0" data-testid="ajuste-item">
      <div className="flex items-baseline justify-between gap-2 text-[13px]">
        <span className="font-semibold">{item.nombre}</span>
        <span className="text-text-2">
          Pedido: {formatearCantidad("kg", item.cantidadOriginal ?? item.cantidad)}
          {item.ajusteEstado === "aceptado" ? ` → ${formatearCantidad("kg", item.cantidad)}` : ""}
        </span>
      </div>
      {item.ajusteEstado !== "ninguno" && (
        <p className="text-[12px] text-text-2">
          <span className="font-semibold text-text">{ESTADO[item.ajusteEstado]}</span>
          {propuesta !== null && ["propuesto", "rechazado", "ratificado"].includes(item.ajusteEstado)
            ? ` · propuesta: ${formatearCantidad("kg", propuesta)} (${pesos(propuesta * item.precioUnitario)})`
            : ""}
        </p>
      )}
      {puedeProponer && (
        <div className="flex flex-col gap-1.5">
          <div className="flex gap-1.5">
            {(["peso", "importe"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setModo(m)}
                className={`press h-9 rounded-pill px-3 text-[12px] font-semibold ${modo === m ? "bg-primary text-white" : "border border-border bg-surface text-text"}`}
              >
                {m === "peso" ? "Por peso (g)" : "Por importe ($)"}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              inputMode="decimal"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder={modo === "peso" ? "Ej. 257" : "Ej. 2570"}
              aria-label={modo === "peso" ? `Peso real de ${item.nombre} en gramos` : `Importe real de ${item.nombre}`}
              className="h-11 min-w-0 flex-1 rounded-control border border-border bg-surface px-3 text-[14px]"
            />
            <button
              type="button"
              disabled={ocupado || !(kg > 0)}
              onClick={() => accion(modo === "peso" ? { accion: "proponer", cantidad: kg } : { accion: "proponer", importe: numero })}
              className="press h-11 rounded-control bg-primary px-4 text-[13px] font-semibold text-white disabled:opacity-50"
            >
              Proponer
            </button>
          </div>
          {kg > 0 && (
            <span className="text-[12px] text-text-2">
              = {formatearCantidad("kg", kg)} · {pesos(kg * item.precioUnitario)}
            </span>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {lado === "tienda" && item.ajusteEstado === "rechazado" && (
          <button type="button" disabled={ocupado} onClick={() => accion({ accion: "ratificar" })} className="press h-10 rounded-control border border-border bg-surface px-3 text-[13px] font-semibold">
            Mantener {formatearCantidad("kg", propuesta!)}
          </button>
        )}
        {lado === "comprador" && ["propuesto", "ratificado"].includes(item.ajusteEstado) && (
          <button type="button" disabled={ocupado} onClick={() => accion({ accion: "aceptar" })} className="press h-10 rounded-control bg-primary px-4 text-[13px] font-semibold text-white">
            Aceptar
          </button>
        )}
        {lado === "comprador" && item.ajusteEstado === "propuesto" && (
          <button type="button" disabled={ocupado} onClick={() => accion({ accion: "rechazar" })} className="press h-10 rounded-control border border-border bg-surface px-4 text-[13px] font-semibold">
            No acepto
          </button>
        )}
        {lado === "comprador" && item.ajusteEstado === "ratificado" && (
          <button type="button" disabled={ocupado} onClick={() => accion({ accion: "quitar" })} className="press h-10 rounded-control border border-border bg-surface px-4 text-[13px] font-semibold">
            Quitar producto
          </button>
        )}
      </div>
      {error && <p className="text-[12px] text-estado-rechazado-text">{error}</p>}
    </li>
  );
}

export function AjustesPeso<T>({ items, lado, pedidoId, onActualizado }: { items: ItemConAjuste[]; lado: "tienda" | "comprador"; pedidoId: string; onActualizado: (p: T) => void }) {
  const porKg = items.filter((i) => i.unidad === "kg" && (lado === "tienda" || i.ajusteEstado !== "ninguno"));
  if (porKg.length === 0) return null;
  return (
    <section aria-labelledby="titulo-ajustes" className="flex flex-col gap-1 rounded-control border border-border p-3">
      <h2 id="titulo-ajustes" className="text-[14px] font-bold">
        Ajuste de peso
      </h2>
      <p className="text-[12px] text-text-2">
        {lado === "tienda"
          ? "Si lo pesado no coincide con lo pedido, proponé el peso o el importe real. El comprador lo acepta antes de marcarlo listo."
          : "La tienda pesó un poco distinto a lo pedido. Aceptá el ajuste o contestá por el chat."}
      </p>
      <ul className="flex flex-col">
        {porKg.map((i) => (
          <Fila key={i.id} item={i} lado={lado} pedidoId={pedidoId} onActualizado={onActualizado} />
        ))}
      </ul>
    </section>
  );
}
