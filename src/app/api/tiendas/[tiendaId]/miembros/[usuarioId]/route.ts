import { NextRequest } from "next/server";
import { actualizarMiembro, quitarMiembro } from "@/lib/equipo/equipo";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { respuestaExitosa, respuestaError } from "@/lib/api-response";
import { AppError } from "@/lib/errors";

type Ctx = { params: Promise<{ tiendaId: string; usuarioId: string }> };

// 19-equipo-tienda.md — cambiar rol/permisos o quitar a un miembro (o dejar la tienda).
export async function PATCH(request: NextRequest, { params }: Ctx) {
  try {
    const usuario = await obtenerUsuarioActual();
    if (!usuario) throw new AppError("NO_AUTENTICADO", "Necesitás iniciar sesión.");
    const { tiendaId, usuarioId } = await params;
    const body = await request.json().catch(() => ({}));
    return respuestaExitosa(await actualizarMiembro(usuario, tiendaId, usuarioId, { rol: body.rol, permisos: body.permisos }));
  } catch (error) {
    return respuestaError(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: Ctx) {
  try {
    const usuario = await obtenerUsuarioActual();
    if (!usuario) throw new AppError("NO_AUTENTICADO", "Necesitás iniciar sesión.");
    const { tiendaId, usuarioId } = await params;
    return respuestaExitosa(await quitarMiembro(usuario, tiendaId, usuarioId));
  } catch (error) {
    return respuestaError(error);
  }
}
