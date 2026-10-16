import { misTiendas } from "@/lib/equipo/equipo";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { respuestaExitosa, respuestaError } from "@/lib/api-response";
import { AppError } from "@/lib/errors";

// 19-equipo-tienda.md — tiendas propias y donde el usuario es parte del equipo.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const usuario = await obtenerUsuarioActual();
    if (!usuario) throw new AppError("NO_AUTENTICADO", "Necesitás iniciar sesión.");
    return respuestaExitosa(await misTiendas(usuario));
  } catch (error) {
    return respuestaError(error);
  }
}
