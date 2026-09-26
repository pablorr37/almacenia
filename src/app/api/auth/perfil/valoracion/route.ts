import { miResumenComoCliente } from "@/lib/valoraciones-clientes/valoraciones-clientes";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { respuestaExitosa, respuestaError } from "@/lib/api-response";
import { AppError } from "@/lib/errors";

// 13-valoraciones-clientes.md — el comprador ve solo su propio resumen.
export async function GET() {
  try {
    const usuario = await obtenerUsuarioActual();
    if (!usuario) throw new AppError("NO_AUTENTICADO", "Necesitás iniciar sesión.");
    return respuestaExitosa(await miResumenComoCliente(usuario));
  } catch (error) {
    return respuestaError(error);
  }
}
