import { permisosFotos } from "@/lib/fotos/banco";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { respuestaExitosa, respuestaError } from "@/lib/api-response";
import { AppError } from "@/lib/errors";

// 16-banco-fotos.md — qué fuentes ve el usuario y si puede subir (arma la UI).
export async function GET() {
  try {
    const usuario = await obtenerUsuarioActual();
    if (!usuario) throw new AppError("NO_AUTENTICADO", "Necesitás iniciar sesión.");
    return respuestaExitosa(await permisosFotos(usuario));
  } catch (error) {
    return respuestaError(error);
  }
}
