import { NextRequest } from "next/server";
import { solicitarVerificacion } from "@/lib/tiendas/tiendas";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { respuestaExitosa, respuestaError } from "@/lib/api-response";
import { AppError } from "@/lib/errors";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ tiendaId: string }> }
) {
  try {
    const usuario = await obtenerUsuarioActual();
    if (!usuario) {
      throw new AppError("NO_AUTENTICADO", "Necesitás iniciar sesión.");
    }

    const { tiendaId } = await params;
    const solicitud = await solicitarVerificacion(usuario, tiendaId);
    return respuestaExitosa(solicitud, 201);
  } catch (error) {
    return respuestaError(error);
  }
}
