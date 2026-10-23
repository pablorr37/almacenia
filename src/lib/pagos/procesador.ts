// Procesadores de pago en pesos (23-puntos-pagos.md). Mismo patrón que Facturador
// (20-precios-facturacion.md): hoy solo existe el pago manual que confirma un admin;
// un adaptador de Mercado Pago devolvería `urlPago` y confirmaría por webhook
// (POST /api/pagos/webhook/:proveedor → aplicarOrdenPagada).

export interface OrdenParaCobrar {
  id: string;
  montoArs: number;
  concepto: "premium" | "publicidad";
}

export interface ProcesadorPagos {
  nombre: string;
  iniciar(orden: OrdenParaCobrar): Promise<{ instrucciones: string; urlPago: string | null }>;
}

export function codigoOrden(id: string): string {
  return id.replace(/-/g, "").slice(0, 8).toUpperCase();
}

function pesos(monto: number): string {
  return monto.toLocaleString("es-AR", { style: "currency", currency: "ARS" });
}

export class PagoManual implements ProcesadorPagos {
  nombre = "manual";

  async iniciar(orden: OrdenParaCobrar): Promise<{ instrucciones: string; urlPago: string | null }> {
    // PAGO_MANUAL_DATOS: alias/CBU o dónde pagar, configurable en Coolify.
    const datos = process.env.PAGO_MANUAL_DATOS?.trim();
    const instrucciones = [
      `Pagá ${pesos(orden.montoArs)} por transferencia o en efectivo indicando el código ${codigoOrden(orden.id)}.`,
      datos ? `Datos para pagar: ${datos}.` : null,
      "Cuando un administrador confirme el pago, se activa solo.",
    ]
      .filter(Boolean)
      .join(" ");
    return { instrucciones, urlPago: null };
  }
}

export function procesadorActivo(): ProcesadorPagos {
  return new PagoManual();
}
