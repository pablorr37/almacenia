// Precio = costo + ganancia + impuestos (20-precios-facturacion.md). Funciones puras,
// sin dependencias de servidor: las usan la lógica y la UI (cálculo en vivo).

export type CondicionIva = "monotributo" | "responsable_inscripto" | "exento";
export type AlicuotaIva = "iva_21" | "iva_10_5" | "iva_27" | "iva_0" | "exento";

export const ALICUOTAS: readonly AlicuotaIva[] = ["iva_21", "iva_10_5", "iva_27", "iva_0", "exento"];
export const CONDICIONES_IVA: readonly CondicionIva[] = ["monotributo", "responsable_inscripto", "exento"];

export const ETIQUETA_ALICUOTA: Record<AlicuotaIva, string> = {
  iva_21: "IVA 21 %",
  iva_10_5: "IVA 10,5 %",
  iva_27: "IVA 27 %",
  iva_0: "IVA 0 %",
  exento: "Exento",
};

export const ETIQUETA_CONDICION: Record<CondicionIva, string> = {
  monotributo: "Monotributo",
  responsable_inscripto: "Responsable inscripto",
  exento: "Exento",
};

const TASAS: Record<AlicuotaIva, number> = { iva_21: 0.21, iva_10_5: 0.105, iva_27: 0.27, iva_0: 0, exento: 0 };

export function tasaIva(alicuota: AlicuotaIva): number {
  return TASAS[alicuota];
}

const redondear = (n: number, decimales: number) => {
  const f = 10 ** decimales;
  return Math.round((n + Number.EPSILON) * f) / f;
};

// Solo el responsable inscripto discrimina IVA; monotributo y exento lo tienen en el costo.
function tasaIvaEfectiva(condicion: CondicionIva, alicuota: AlicuotaIva): number {
  return condicion === "responsable_inscripto" ? tasaIva(alicuota) : 0;
}

interface ParametrosFiscales {
  condicion: CondicionIva;
  alicuota: AlicuotaIva;
  internos: number; // % sobre el neto
}

export function calcularPrecio(p: ParametrosFiscales & { costo: number; margen: number }): number {
  const neto = p.costo * (1 + p.margen / 100);
  return redondear(neto * (1 + tasaIvaEfectiva(p.condicion, p.alicuota) + p.internos / 100), 2);
}

export function desglosar(precioFinal: number, p: ParametrosFiscales): { neto: number; iva: number; internos: number } {
  const tasa = tasaIvaEfectiva(p.condicion, p.alicuota);
  const neto = redondear(precioFinal / (1 + tasa + p.internos / 100), 4);
  const iva = redondear(neto * tasa, 4);
  // Los internos son el resto: así neto + IVA + internos = precio, exacto.
  return { neto, iva, internos: redondear(precioFinal - neto - iva, 4) };
}

export function margenDesde(precioFinal: number, p: ParametrosFiscales & { costo: number }): number | null {
  if (!(p.costo > 0)) return null;
  const { neto } = desglosar(precioFinal, p);
  return redondear((neto / p.costo - 1) * 100, 2);
}
