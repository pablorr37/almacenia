// Unidades de venta y validación de cantidades (specs/sdd/03-productos.md,
// "Cantidades y unidades"). Puro: se usa en el server y en el cliente.
import { AppError } from "@/lib/errors";

export type UnidadMedida = "unidad" | "kg";

// Paso del stepper +/- de la UI (50 g en kg).
const PASO: Record<UnidadMedida, number> = { unidad: 1, kg: 0.05 };
// Resolución de una cantidad válida: enteros, o gramos en kg (para poder cargar por
// importe, "$3.000 de queso" → 0,25 kg; ver pesoPorImporte).
const RESOLUCION: Record<UnidadMedida, number> = { unidad: 1, kg: 0.001 };
// Se trabaja en milésimas (3 decimales, como NUMERIC(10, 3)) para no arrastrar
// errores de coma flotante (0.1 + 0.2).
const ESCALA = 1000;

export function pasoDe(unidad: UnidadMedida): number {
  return PASO[unidad];
}

export function redondearCantidad(unidad: UnidadMedida, cantidad: number): number {
  const resolucion = RESOLUCION[unidad];
  return Math.round(Math.round(cantidad / resolucion) * resolucion * ESCALA) / ESCALA;
}

// Peso equivalente a un importe (03-productos.md, "$ Importe"): importe / precio por
// kg, redondeado a 1 g. 0 si alguno de los dos no es un número positivo.
export function pesoPorImporte(importe: number, precioPorKg: number): number {
  if (!Number.isFinite(importe) || !Number.isFinite(precioPorKg) || importe <= 0 || precioPorKg <= 0) return 0;
  return redondearCantidad("kg", importe / precioPorKg);
}

export function esCantidadValida(
  unidad: UnidadMedida,
  cantidad: number,
  opciones: { permitirCero?: boolean } = {}
): boolean {
  if (typeof cantidad !== "number" || !Number.isFinite(cantidad)) return false;
  const minimo = opciones.permitirCero ? 0 : RESOLUCION[unidad];
  if (cantidad < minimo - 1e-9) return false;
  const pasos = cantidad / RESOLUCION[unidad];
  return Math.abs(pasos - Math.round(pasos)) < 1e-6;
}

export function validarCantidad(
  unidad: UnidadMedida,
  cantidad: number,
  opciones: { permitirCero?: boolean } = {}
): void {
  if (!esCantidadValida(unidad, cantidad, opciones)) {
    throw new AppError(
      "CANTIDAD_INVALIDA",
      unidad === "kg"
        ? "La cantidad en kg admite hasta gramos (ej. 0,25 kg o 0,208 kg)."
        : "La cantidad tiene que ser un número entero de unidades."
    );
  }
}

export function formatearCantidad(unidad: UnidadMedida, cantidad: number): string {
  if (unidad === "unidad") return `${cantidad} u.`;
  if (cantidad < 1) return `${Math.round(cantidad * 1000)} g`;
  return `${cantidad.toLocaleString("es-AR", { maximumFractionDigits: 3 })} kg`;
}
