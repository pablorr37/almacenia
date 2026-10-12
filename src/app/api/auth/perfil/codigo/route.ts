import { generarCodigoCliente } from "@/lib/clientes/codigo-cliente";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { respuestaExitosa, respuestaError } from "@/lib/api-response";
import { AppError } from "@/lib/errors";

// 01-auth.md — "Compartir QR": código de 6 dígitos que vale 10 minutos.
export async function POST() {
  try {
    const usuario = await obtenerUsuarioActual();
    if (!usuario) throw new AppError("NO_AUTENTICADO", "Necesitás iniciar sesión.");
    return respuestaExitosa(await generarCodigoCliente(usuario), 201);
  } catch (error) {
    return respuestaError(error);
  }
}
