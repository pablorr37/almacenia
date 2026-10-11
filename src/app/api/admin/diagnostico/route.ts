import { diagnosticar } from "@/lib/admin/diagnostico";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { respuestaExitosa, respuestaError } from "@/lib/api-response";
import { AppError } from "@/lib/errors";

// 11-admin.md — prueba la base de datos y el almacenamiento de fotos.
export async function GET() {
  try {
    const usuario = await obtenerUsuarioActual();
    if (!usuario) throw new AppError("NO_AUTENTICADO", "Necesitás iniciar sesión.");
    return respuestaExitosa(await diagnosticar(usuario));
  } catch (error) {
    return respuestaError(error);
  }
}
