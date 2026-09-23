import { obtenerTiendaPorVendedor } from "@/lib/tiendas/tiendas";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { respuestaExitosa, respuestaError } from "@/lib/api-response";
import { AppError } from "@/lib/errors";

export async function GET() {
  try {
    const usuario = await obtenerUsuarioActual();
    if (!usuario) {
      throw new AppError("NO_AUTENTICADO", "Necesitás iniciar sesión.");
    }

    const tienda = await obtenerTiendaPorVendedor(usuario.id);
    if (!tienda) {
      throw new AppError("TIENDA_NO_ENCONTRADA", "Todavía no creaste tu tienda.");
    }
    return respuestaExitosa(tienda);
  } catch (error) {
    return respuestaError(error);
  }
}
