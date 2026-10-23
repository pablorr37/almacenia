import { contarNoLeidas } from "@/lib/notificaciones/notificaciones";
import { respuestaExitosa, respuestaError } from "@/lib/api-response";
import { usuarioRequerido } from "@/lib/api-sesion";

// 22-notificaciones.md
export async function GET() {
  try {
    return respuestaExitosa({ cantidad: await contarNoLeidas(await usuarioRequerido()) });
  } catch (error) {
    return respuestaError(error);
  }
}
