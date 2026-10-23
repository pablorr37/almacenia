import { NextRequest } from "next/server";
import { listarNotificaciones } from "@/lib/notificaciones/notificaciones";
import { respuestaExitosa, respuestaError } from "@/lib/api-response";
import { usuarioRequerido } from "@/lib/api-sesion";

// 22-notificaciones.md
export async function GET(request: NextRequest) {
  try {
    const usuario = await usuarioRequerido();
    const sp = request.nextUrl.searchParams;
    const r = await listarNotificaciones(usuario, { page: Number(sp.get("page")) || undefined, pageSize: Number(sp.get("pageSize")) || undefined });
    return respuestaExitosa(r.data, 200, { page: r.page, pageSize: r.pageSize, total: r.total });
  } catch (error) {
    return respuestaError(error);
  }
}
