import { NextRequest } from "next/server";
import { listarProductosAdmin } from "@/lib/admin/productos";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { respuestaExitosa, respuestaError } from "@/lib/api-response";
import { AppError } from "@/lib/errors";
import type { Categoria } from "@/generated-prisma/client";

export async function GET(request: NextRequest) {
  try {
    const usuario = await obtenerUsuarioActual();
    if (!usuario) {
      throw new AppError("NO_AUTENTICADO", "Necesitás iniciar sesión.");
    }

    const sp = request.nextUrl.searchParams;
    const resultado = await listarProductosAdmin(usuario, {
      tiendaId: sp.get("tiendaId") ?? undefined,
      categoria: (sp.get("categoria") as Categoria) ?? undefined,
      q: sp.get("q") ?? undefined,
      page: sp.get("page") ? Number(sp.get("page")) : undefined,
      pageSize: sp.get("pageSize") ? Number(sp.get("pageSize")) : undefined,
    });
    return respuestaExitosa(resultado.data, 200, {
      page: resultado.page,
      pageSize: resultado.pageSize,
      total: resultado.total,
    });
  } catch (error) {
    return respuestaError(error);
  }
}
