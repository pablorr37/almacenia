import { totalPuntos } from "@/lib/gamificacion/gamificacion";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { respuestaExitosa, respuestaError } from "@/lib/api-response";
import { AppError } from "@/lib/errors";

// 12-gamificacion.md
export async function GET() {
  try {
    const usuario = await obtenerUsuarioActual();
    if (!usuario) throw new AppError("NO_AUTENTICADO", "Necesitás iniciar sesión.");
    return respuestaExitosa({ total: await totalPuntos(usuario.id) });
  } catch (error) {
    return respuestaError(error);
  }
}
