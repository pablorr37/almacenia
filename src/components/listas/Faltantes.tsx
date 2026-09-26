"use client";

import type { MotivoFaltante } from "@/lib/itinerario/planes";
import { formatearCantidad, pasoDe, type UnidadMedida } from "@/lib/productos/unidades";

// Radios del selector de la comparación: "Ampliar" salta al primero que incluye a la
// tienda más cercana.
export const RADIOS_KM = [1, 2, 5, 10, 20, 50];

export interface AccionesFaltante {
  radioKm: number;
  maxTiendas: number;
  ampliarRadio: (km: number) => void;
  incluirCerradas: () => void;
  ajustarCantidad: (catalogoId: string, cantidad: number) => void;
}

const fmtKm = (km: number) => (km < 1 ? `${Math.round(km * 1000)} m` : `${km.toLocaleString("es-AR", { maximumFractionDigits: 1 })} km`);

// Texto del motivo de un faltante (15-itinerario.md §7).
export function textoMotivo(m: MotivoFaltante, radioKm: number, maxTiendas: number, unidad: UnidadMedida = "unidad"): string {
  switch (m.tipo) {
    case "limite_del_plan":
      return `Se consigue cerca, pero no entra en este plan: tiene un máximo de ${maxTiendas} paradas. Mirá otro plan o la tabla por producto.`;
    case "stock_insuficiente":
      return m.stockMaximo > 0
        ? `No hay stock suficiente: hay hasta ${formatearCantidad(unidad, m.stockMaximo)} en ${m.tiendaStockMaximo}.`
        : "Las tiendas cercanas que lo venden no tienen stock.";
    case "solo_cerradas":
      return `Solo lo ${m.cantidadTiendas === 1 ? "tiene 1 tienda cerrada" : `tienen ${m.cantidadTiendas} tiendas cerradas`} ahora.`;
    case "fuera_de_radio":
      return `No hay tiendas con este producto a menos de ${radioKm} km. La más cercana está a ${fmtKm(m.masCercanaKm)}.`;
    case "sin_oferta":
      return "Ninguna tienda cercana lo publica todavía.";
  }
}

export function AccionMotivo({
  catalogoId,
  motivo,
  acciones,
  unidad = "unidad",
}: {
  catalogoId: string;
  motivo: MotivoFaltante;
  acciones: AccionesFaltante;
  unidad?: UnidadMedida;
}) {
  const clase = "press rounded-pill border border-estado-pendiente-text/40 bg-surface px-3 py-1.5 text-[12px] font-semibold text-estado-pendiente-text";
  if (motivo.tipo === "fuera_de_radio") {
    const destino = RADIOS_KM.find((r) => r >= motivo.masCercanaKm && r > acciones.radioKm);
    if (!destino) return null;
    return (
      <button type="button" className={clase} onClick={() => acciones.ampliarRadio(destino)}>
        Ampliar a {destino} km
      </button>
    );
  }
  if (motivo.tipo === "solo_cerradas") {
    return (
      <button type="button" className={clase} onClick={acciones.incluirCerradas}>
        Incluir cerradas
      </button>
    );
  }
  if (motivo.tipo === "stock_insuficiente") {
    // Se pide lo que hay, redondeado hacia abajo al paso de la unidad (50 g o 1 u.).
    const paso = pasoDe(unidad);
    const disponible = Math.floor(motivo.stockMaximo / paso + 1e-9) * paso;
    if (disponible < paso) return null;
    return (
      <button type="button" className={clase} onClick={() => acciones.ajustarCantidad(catalogoId, Math.round(disponible * 1000) / 1000)}>
        Pedir {formatearCantidad(unidad, disponible)}
      </button>
    );
  }
  return null;
}

// Lista de faltantes con su motivo y acción.
export function Faltantes({
  faltantes,
  acciones,
}: {
  faltantes: Array<{ catalogoId: string; nombre: string; unidad: UnidadMedida; motivo: MotivoFaltante }>;
  acciones: AccionesFaltante;
}) {
  if (faltantes.length === 0) return null;
  return (
    <div className="flex flex-col gap-2 rounded-card bg-estado-pendiente-bg p-3 text-estado-pendiente-text">
      <strong className="text-[13px]">
        {faltantes.length === 1 ? "Falta 1 producto" : `Faltan ${faltantes.length} productos`} en este plan
      </strong>
      <ul className="flex flex-col gap-2.5">
        {faltantes.map((f) => (
          <li key={f.catalogoId} className="flex flex-col gap-1.5">
            <span className="text-[13px]">
              <strong>{f.nombre}:</strong> {textoMotivo(f.motivo, acciones.radioKm, acciones.maxTiendas, f.unidad)}
            </span>
            <span className="self-start">
              <AccionMotivo catalogoId={f.catalogoId} motivo={f.motivo} acciones={acciones} unidad={f.unidad} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
