import { NextRequest } from "next/server";
import { usarFoto } from "@/lib/fotos/banco";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { respuestaExitosa, respuestaError } from "@/lib/api-response";
import { AppError } from "@/lib/errors";

// 16-banco-fotos.md — usar una foto del banco en un catálogo o en un producto propio.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const usuario = await obtenerUsuarioActual();
    if (!usuario) throw new AppError("NO_AUTENTICADO", "Necesitás iniciar sesión.");

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const destino =
      typeof body.productoId === "string" ? { productoId: body.productoId } : { catalogoId: body.catalogoId };
    return respuestaExitosa(await usarFoto(usuario, id, destino));
  } catch (error) {
    return respuestaError(error);
  }
}
