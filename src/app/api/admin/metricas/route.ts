import { NextRequest } from "next/server";
import { obtenerMetricas } from "@/lib/admin/metricas";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { respuestaExitosa, respuestaError } from "@/lib/api-response";
import { AppError } from "@/lib/errors";

export async function GET(request: NextRequest) {
  try {
    const usuario = await obtenerUsuarioActual();
    if (!usuario) {
      throw new AppError("NO_AUTENTICADO", "Necesitás iniciar sesión.");
    }

    const sp = request.nextUrl.searchParams;
    const metricas = await obtenerMetricas(usuario, {
      desde: sp.get("desde") ?? undefined,
      hasta: sp.get("hasta") ?? undefined,
    });
    return respuestaExitosa(metricas);
  } catch (error) {
    return respuestaError(error);
  }
}
