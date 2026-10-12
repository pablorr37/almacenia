"use client";

import { formatearCantidad, type UnidadMedida } from "@/lib/productos/unidades";

// Detalle de un pedido (04-pedidos.md): productos con cantidad, precio y subtotal,
// la nota del comprador y el total. Lo usan mi-tienda (vendedor) y /pedidos/:id.
export interface ItemPedidoVista {
  id: string;
  nombre: string;
  unidad: UnidadMedida;
  cantidad: number;
  precioUnitario: number;
}

const formatoARS = (n: number) =>
  "$" + n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function DetallePedido({ items, nota, total }: { items: ItemPedidoVista[]; nota: string | null; total: number }) {
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col divide-y divide-border rounded-control border border-border">
        {items.map((item) => (
          <li key={item.id} className="flex items-start justify-between gap-3 px-3 py-2 text-[13px]">
            <span className="flex min-w-0 flex-col">
              <span className="font-semibold text-text">{item.nombre}</span>
              <span className="text-[12px] text-text-2">
                {formatearCantidad(item.unidad, item.cantidad)} × {formatoARS(item.precioUnitario)}
                {item.unidad === "kg" ? " / kg" : ""}
              </span>
            </span>
            <span className="flex-shrink-0 font-semibold">{formatoARS(item.cantidad * item.precioUnitario)}</span>
          </li>
        ))}
      </ul>
      {nota && <p className="rounded-control bg-bg px-3 py-2 text-[13px] italic text-text">Nota: “{nota}”</p>}
      <div className="flex justify-between text-[15px] font-bold">
        <span>Total</span>
        <span>{formatoARS(total)}</span>
      </div>
    </div>
  );
}

// "hace 5 min", "hace 2 h", "ayer 18:30"…
export function haceCuanto(iso: string, ahora = new Date()): string {
  const minutos = Math.max(0, Math.round((ahora.getTime() - new Date(iso).getTime()) / 60000));
  if (minutos < 1) return "recién";
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  return new Date(iso).toLocaleString("es-AR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Argentina/San_Juan",
  });
}
