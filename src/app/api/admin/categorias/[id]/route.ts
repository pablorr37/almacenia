import { NextRequest } from "next/server";
import { actualizarCategoria, eliminarCategoria } from "@/lib/rubros-categorias/rubros-categorias";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { respuestaExitosa, respuestaError } from "@/lib/api-response";
import { AppError } from "@/lib/errors";

type Ctx = { params: Promise<{ id: string }> };

// 17-rubros-categorias.md — solo admin.
export async function PATCH(request: NextRequest, { params }: Ctx) {
  try {
    const usuario = await obtenerUsuarioActual();
    if (!usuario) throw new AppError("NO_AUTENTICADO", "Necesitás iniciar sesión.");
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    return respuestaExitosa(await actualizarCategoria(usuario, id, { nombre: body.nombre }));
  } catch (error) {
    return respuestaError(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: Ctx) {
  try {
    const usuario = await obtenerUsuarioActual();
    if (!usuario) throw new AppError("NO_AUTENTICADO", "Necesitás iniciar sesión.");
    const { id } = await params;
    await eliminarCategoria(usuario, id);
    return respuestaExitosa({ id });
  } catch (error) {
    return respuestaError(error);
  }
}
