import { NextRequest } from "next/server";
import { asignarFotoCatalogo } from "@/lib/catalogo/catalogo";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { respuestaExitosa, respuestaError } from "@/lib/api-response";
import { AppError } from "@/lib/errors";

// 06-catalogo.md — "Foto del catálogo".
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const usuario = await obtenerUsuarioActual();
    if (!usuario) {
      throw new AppError("NO_AUTENTICADO", "Necesitás iniciar sesión.");
    }

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    if (typeof body.imagenUrl !== "string" || body.imagenUrl.length === 0) {
      throw new AppError("IMAGEN_URL_INVALIDA", "Falta imagenUrl.");
    }
    const catalogo = await asignarFotoCatalogo(usuario, id, body.imagenUrl);
    return respuestaExitosa(catalogo);
  } catch (error) {
    return respuestaError(error);
  }
}
