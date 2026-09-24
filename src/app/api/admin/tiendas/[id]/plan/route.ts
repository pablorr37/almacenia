import { NextRequest } from "next/server";
import { cambiarPlan } from "@/lib/planes/planes";
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
    const tienda = await cambiarPlan(usuario, id, body.plan);
    return respuestaExitosa(tienda);
  } catch (error) {
    return respuestaError(error);
  }
}
