import { NextRequest } from "next/server";
import { revisarFoto } from "@/lib/fotos/banco";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { respuestaExitosa, respuestaError } from "@/lib/api-response";
import { AppError } from "@/lib/errors";

// 16-banco-fotos.md — revisar (aprobar/rechazar, etiquetas). Solo curadores.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const usuario = await obtenerUsuarioActual();
    if (!usuario) throw new AppError("NO_AUTENTICADO", "Necesitás iniciar sesión.");

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const foto = await revisarFoto(usuario, id, { estado: body.estado, etiquetas: body.etiquetas });
    return respuestaExitosa(foto);
  } catch (error) {
    return respuestaError(error);
  }
}
