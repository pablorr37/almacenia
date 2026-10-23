import { NextRequest } from "next/server";
import { listarCampaniasAdmin } from "@/lib/publicidad/campanias";
import type { EstadoCampania } from "@/generated-prisma/client";
import { respuestaExitosa, respuestaError } from "@/lib/api-response";
import { usuarioRequerido } from "@/lib/api-sesion";

// 21-publicidad.md
export async function GET(request: NextRequest) {
  try {
    const admin = await usuarioRequerido();
    const sp = request.nextUrl.searchParams;
    const r = await listarCampaniasAdmin(admin, {
      estado: (sp.get("estado") || undefined) as EstadoCampania | undefined,
      page: Number(sp.get("page")) || undefined,
      pageSize: Number(sp.get("pageSize")) || undefined,
    });
    return respuestaExitosa(r.data, 200, { page: r.page, pageSize: r.pageSize, total: r.total });
  } catch (error) {
    return respuestaError(error);
  }
}
