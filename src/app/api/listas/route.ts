import { NextRequest } from "next/server";
import { crearLista, listarListas } from "@/lib/listas/listas";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { respuestaExitosa, respuestaError } from "@/lib/api-response";
import { AppError } from "@/lib/errors";

// 14-listas-compras.md
export async function GET(request: NextRequest) {
  try {
    const usuario = await obtenerUsuarioActual();
    if (!usuario) throw new AppError("NO_AUTENTICADO", "Necesitás iniciar sesión.");
    const sp = request.nextUrl.searchParams;
    const r = await listarListas(usuario, {
      page: sp.get("page") ? Number(sp.get("page")) : undefined,
      pageSize: sp.get("pageSize") ? Number(sp.get("pageSize")) : undefined,
    });
    return respuestaExitosa(r.data, 200, { page: r.page, pageSize: r.pageSize, total: r.total });
  } catch (error) {
    return respuestaError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const usuario = await obtenerUsuarioActual();
    if (!usuario) throw new AppError("NO_AUTENTICADO", "Necesitás iniciar sesión.");
    const body = await request.json().catch(() => ({}));
    return respuestaExitosa(await crearLista(usuario, { nombre: body.nombre, items: body.items ?? [] }), 201);
  } catch (error) {
    return respuestaError(error);
  }
}
