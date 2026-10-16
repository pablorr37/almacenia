import { NextRequest } from "next/server";
import { misTiendas, exigirPermiso, PERMISOS } from "@/lib/equipo/equipo";
import { obtenerTienda } from "@/lib/tiendas/tiendas";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { respuestaExitosa, respuestaError } from "@/lib/api-response";
import { AppError } from "@/lib/errors";

// 02-tiendas.md / 19-equipo-tienda.md: la tienda pedida (si tiene acceso) o la primera.
export async function GET(request: NextRequest) {
  try {
    const usuario = await obtenerUsuarioActual();
    if (!usuario) {
      throw new AppError("NO_AUTENTICADO", "Necesitás iniciar sesión.");
    }

    const tiendaId = request.nextUrl.searchParams.get("tiendaId");
    if (tiendaId) {
      await exigirPermiso(usuario, tiendaId, PERMISOS.slice()).catch((e) => {
        // Un miembro sin ningún permiso igual puede ver su tienda.
        if (!(e instanceof AppError) || e.code !== "SIN_PERMISO") throw e;
      });
      return respuestaExitosa(await obtenerTienda(tiendaId));
    }

    const [primera] = await misTiendas(usuario);
    if (!primera) {
      throw new AppError("TIENDA_NO_ENCONTRADA", "Todavía no creaste tu tienda.");
    }
    return respuestaExitosa(primera.tienda);
  } catch (error) {
    return respuestaError(error);
  }
}
