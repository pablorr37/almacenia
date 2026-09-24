import { NextRequest } from "next/server";
import { actualizarPerfil } from "@/lib/auth/auth";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { respuestaExitosa, respuestaError } from "@/lib/api-response";
import { AppError } from "@/lib/errors";

export async function PATCH(request: NextRequest) {
  try {
    const usuario = await obtenerUsuarioActual();
    if (!usuario) {
      throw new AppError("NO_AUTENTICADO", "Necesitás iniciar sesión.");
    }

    const body = await request.json();
    const actualizado = await actualizarPerfil(usuario, { nombre: body.nombre, avatarUrl: body.avatarUrl });
    return respuestaExitosa(actualizado);
  } catch (error) {
    return respuestaError(error);
  }
}
