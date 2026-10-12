import { NextRequest } from "next/server";
import { listarCatalogoDeCompradores } from "@/lib/admin/productos";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { respuestaExitosa, respuestaError } from "@/lib/api-response";
import { AppError } from "@/lib/errors";

// 06-catalogo.md — productos que sumaron compradores desde sus listas.
export async function GET(request: NextRequest) {
  try {
    const usuario = await obtenerUsuarioActual();
    if (!usuario) throw new AppError("NO_AUTENTICADO", "Necesitás iniciar sesión.");
    const sp = request.nextUrl.searchParams;
    const r = await listarCatalogoDeCompradores(usuario, {
      page: sp.get("page") ? Number(sp.get("page")) : undefined,
      pageSize: sp.get("pageSize") ? Number(sp.get("pageSize")) : undefined,
    });
    return respuestaExitosa(r.data, 200, { page: r.page, pageSize: r.pageSize, total: r.total });
  } catch (error) {
    return respuestaError(error);
  }
}
