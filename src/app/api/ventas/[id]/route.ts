import { NextRequest } from "next/server";
import { obtenerVenta } from "@/lib/ventas/ventas";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { respuestaExitosa, respuestaError } from "@/lib/api-response";
import { AppError } from "@/lib/errors";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const usuario = await obtenerUsuarioActual();
    if (!usuario) {
      throw new AppError("NO_AUTENTICADO", "Necesitás iniciar sesión.");
    }

    const { id } = await params;
    const venta = await obtenerVenta(usuario, id);
    if (!venta) {
      throw new AppError("VENTA_NO_ENCONTRADA", "La venta no existe.");
    }
    return respuestaExitosa(venta);
  } catch (error) {
    return respuestaError(error);
  }
}
