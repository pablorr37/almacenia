import { NextRequest } from "next/server";
import { obtenerLista, actualizarLista, eliminarLista } from "@/lib/listas/listas";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { respuestaExitosa, respuestaError } from "@/lib/api-response";
import { AppError } from "@/lib/errors";

type Ctx = { params: Promise<{ id: string }> };

// 14-listas-compras.md
export async function GET(_request: NextRequest, { params }: Ctx) {
  try {
    const usuario = await obtenerUsuarioActual();
    if (!usuario) throw new AppError("NO_AUTENTICADO", "Necesitás iniciar sesión.");
    const { id } = await params;
    return respuestaExitosa(await obtenerLista(usuario, id));
  } catch (error) {
    return respuestaError(error);
  }
}

export async function PATCH(request: NextRequest, { params }: Ctx) {
  try {
    const usuario = await obtenerUsuarioActual();
    if (!usuario) throw new AppError("NO_AUTENTICADO", "Necesitás iniciar sesión.");
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    return respuestaExitosa(await actualizarLista(usuario, id, { nombre: body.nombre, items: body.items }));
  } catch (error) {
    return respuestaError(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: Ctx) {
  try {
    const usuario = await obtenerUsuarioActual();
    if (!usuario) throw new AppError("NO_AUTENTICADO", "Necesitás iniciar sesión.");
    const { id } = await params;
    return respuestaExitosa(await eliminarLista(usuario, id));
  } catch (error) {
    return respuestaError(error);
  }
}
