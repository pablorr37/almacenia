import { NextRequest } from "next/server";
import { eliminarEntradaCatalogo } from "@/lib/admin/productos";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { respuestaExitosa, respuestaError } from "@/lib/api-response";
import { AppError } from "@/lib/errors";

// 06-catalogo.md — el admin borra una entrada que ninguna tienda vende.
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const usuario = await obtenerUsuarioActual();
    if (!usuario) throw new AppError("NO_AUTENTICADO", "Necesitás iniciar sesión.");
    const { id } = await params;
    return respuestaExitosa(await eliminarEntradaCatalogo(usuario, id));
  } catch (error) {
    return respuestaError(error);
  }
}
