import { puntosGanados, saldoPuntos } from "@/lib/gamificacion/gamificacion";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { respuestaExitosa, respuestaError } from "@/lib/api-response";
import { AppError } from "@/lib/errors";

// 12-gamificacion.md, 23-puntos-pagos.md
export async function GET() {
  try {
    const usuario = await obtenerUsuarioActual();
    if (!usuario) throw new AppError("NO_AUTENTICADO", "Necesitás iniciar sesión.");
    const [saldo, ganados] = await Promise.all([saldoPuntos(usuario.id), puntosGanados(usuario.id)]);
    // 23-puntos-pagos.md: `total` = saldo, por compatibilidad.
    return respuestaExitosa({ total: saldo, saldo, ganados });
  } catch (error) {
    return respuestaError(error);
  }
}
