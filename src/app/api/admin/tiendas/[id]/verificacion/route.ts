import { NextRequest } from "next/server";
import { verificarTiendaAdmin } from "@/lib/admin/tiendas";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { respuestaExitosa, respuestaError } from "@/lib/api-response";
import { AppError } from "@/lib/errors";

// 11-admin.md — el admin verifica (o quita la verificación de) una tienda.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const usuario = await obtenerUsuarioActual();
    if (!usuario) throw new AppError("NO_AUTENTICADO", "Necesitás iniciar sesión.");

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    return respuestaExitosa(await verificarTiendaAdmin(usuario, id, body.verificada));
  } catch (error) {
    return respuestaError(error);
  }
}
