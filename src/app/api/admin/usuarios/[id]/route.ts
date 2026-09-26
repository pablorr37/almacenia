import { NextRequest } from "next/server";
import { marcarTester } from "@/lib/admin/usuarios";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { respuestaExitosa, respuestaError } from "@/lib/api-response";
import { AppError } from "@/lib/errors";

// 11-admin.md — marcar/desmarcar tester (curador del banco de fotos).
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const usuario = await obtenerUsuarioActual();
    if (!usuario) throw new AppError("NO_AUTENTICADO", "Necesitás iniciar sesión.");

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    return respuestaExitosa(await marcarTester(usuario, id, body.esTester));
  } catch (error) {
    return respuestaError(error);
  }
}
