import { NextRequest } from "next/server";
import { listarConfig, actualizarConfig } from "@/lib/config/config";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { respuestaExitosa, respuestaError } from "@/lib/api-response";
import { AppError } from "@/lib/errors";

// 11-admin.md — configuración del sistema.
export async function GET() {
  try {
    const usuario = await obtenerUsuarioActual();
    if (!usuario) throw new AppError("NO_AUTENTICADO", "Necesitás iniciar sesión.");
    return respuestaExitosa(await listarConfig(usuario));
  } catch (error) {
    return respuestaError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const usuario = await obtenerUsuarioActual();
    if (!usuario) throw new AppError("NO_AUTENTICADO", "Necesitás iniciar sesión.");
    const body = await request.json().catch(() => ({}));
    return respuestaExitosa(await actualizarConfig(usuario, String(body.clave ?? ""), body.valor));
  } catch (error) {
    return respuestaError(error);
  }
}
