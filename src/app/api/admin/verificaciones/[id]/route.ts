import { NextRequest } from "next/server";
import { revisarSolicitudVerificacion } from "@/lib/tiendas/tiendas";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { respuestaExitosa, respuestaError } from "@/lib/api-response";
import { AppError } from "@/lib/errors";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const usuario = await obtenerUsuarioActual();
    if (!usuario) {
      throw new AppError("NO_AUTENTICADO", "Necesitás iniciar sesión.");
    }

    const { id } = await params;
    const body = await request.json();
    const solicitud = await revisarSolicitudVerificacion(usuario, id, body.decision, body.notaAdmin);
    return respuestaExitosa(solicitud);
  } catch (error) {
    return respuestaError(error);
  }
}
