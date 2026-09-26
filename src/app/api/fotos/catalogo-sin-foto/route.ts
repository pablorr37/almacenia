import { NextRequest } from "next/server";
import { catalogoSinFoto } from "@/lib/fotos/banco";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { respuestaExitosa, respuestaError } from "@/lib/api-response";
import { AppError } from "@/lib/errors";

// 11-admin.md / 16-banco-fotos.md — curaduría: catálogo sin foto. Solo curadores.
export async function GET(request: NextRequest) {
  try {
    const usuario = await obtenerUsuarioActual();
    if (!usuario) throw new AppError("NO_AUTENTICADO", "Necesitás iniciar sesión.");
    const sp = request.nextUrl.searchParams;
    const r = await catalogoSinFoto(usuario, {
      q: sp.get("q") ?? undefined,
      page: sp.get("page") ? Number(sp.get("page")) : undefined,
      pageSize: sp.get("pageSize") ? Number(sp.get("pageSize")) : undefined,
    });
    return respuestaExitosa(r.data, 200, { page: r.page, pageSize: r.pageSize, total: r.total });
  } catch (error) {
    return respuestaError(error);
  }
}
