// Facturación electrónica (20-precios-facturacion.md). La interfaz deja lista la
// conexión con ARCA (WSFEv1, con el certificado del contribuyente) para otra ronda; por
// ahora el único adaptador es SinFacturacion: los comprobantes quedan "internos".

export interface ResultadoAutorizacion {
  estado: "interno" | "autorizado" | "rechazado";
  cae?: string;
  caeVencimiento?: string; // YYYY-MM-DD
  motivo?: string;
}

export interface Facturador {
  autorizar(comprobante?: { tipo: "A" | "B" | "C"; puntoVenta: number; numero: number; total: number }): Promise<ResultadoAutorizacion>;
}

export class SinFacturacion implements Facturador {
  async autorizar(): Promise<ResultadoAutorizacion> {
    return { estado: "interno" };
  }
}

// Único lugar donde se elige el adaptador.
export function facturadorActivo(): Facturador {
  return new SinFacturacion();
}
