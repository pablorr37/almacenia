import { NextRequest } from "next/server";
import { rentabilidadSucursales } from "@/lib/ventas/balance";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { respuestaExitosa, respuestaError } from "@/lib/api-response";
import { AppError } from "@/lib/errors";

// 20-precios-facturacion.md — rentabilidad de todas las tiendas propias (plata).
export async function GET(request: NextRequest) {
  try {
    const usuario = await obtenerUsuarioActual();
    if (!usuario) throw new AppError("NO_AUTENTICADO", "Necesitás iniciar sesión.");
    const sp = request.nextUrl.searchParams;
    return respuestaExitosa(
      await rentabilidadSucursales(usuario, { desde: sp.get("desde") ?? undefined, hasta: sp.get("hasta") ?? undefined })
    );
  } catch (error) {
    return respuestaError(error);
  }
}
