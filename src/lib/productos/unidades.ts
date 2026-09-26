// Unidades de venta y validación de cantidades (specs/sdd/03-productos.md,
// "Cantidades y unidades"). Puro: se usa en el server y en el cliente.
import { AppError } from "@/lib/errors";

export type UnidadMedida = "unidad" | "kg";

const PASO: Record<UnidadMedida, number> = { unidad: 1, kg: 0.05 };
// Se trabaja en milésimas (3 decimales, como NUMERIC(10, 3)) para no arrastrar
// errores de coma flotante (0.1 + 0.2).
const ESCALA = 1000;

export function pasoDe(unidad: UnidadMedida): number {
  return PASO[unidad];
}

export function redondearCantidad(unidad: UnidadMedida, cantidad: number): number {
  const paso = PASO[unidad];
  return Math.round(Math.round(cantidad / paso) * paso * ESCALA) / ESCALA;
}

export function esCantidadValida(
  unidad: UnidadMedida,
  cantidad: number,
  opciones: { permitirCero?: boolean } = {}
): boolean {
  if (typeof cantidad !== "number" || !Number.isFinite(cantidad)) return false;
  const minimo = opciones.permitirCero ? 0 : PASO[unidad];
  if (cantidad < minimo - 1e-9) return false;
  const pasos = cantidad / PASO[unidad];
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
        ? "La cantidad en kg tiene que ir de a 50 g (ej. 0,25 kg)."
        : "La cantidad tiene que ser un número entero de unidades."
    );
  }
}

export function formatearCantidad(unidad: UnidadMedida, cantidad: number): string {
  if (unidad === "unidad") return `${cantidad} u.`;
  if (cantidad < 1) return `${Math.round(cantidad * 1000)} g`;
  return `${cantidad.toLocaleString("es-AR", { maximumFractionDigits: 3 })} kg`;
}
