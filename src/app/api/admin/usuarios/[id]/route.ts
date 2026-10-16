import { NextRequest } from "next/server";
import { marcarTester, cambiarEstadoCuenta, eliminarUsuario, cambiarPlanUsuario } from "@/lib/admin/usuarios";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { respuestaExitosa, respuestaError } from "@/lib/api-response";
import { AppError } from "@/lib/errors";

// 11-admin.md — marcar/desmarcar tester (curador del banco de fotos), cambiar el
// estado de la cuenta (pausar / banear / reactivar) o el plan (18-alcance.md).
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const usuario = await obtenerUsuarioActual();
    if (!usuario) throw new AppError("NO_AUTENTICADO", "Necesitás iniciar sesión.");

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    if (body.plan !== undefined) {
      return respuestaExitosa(await cambiarPlanUsuario(usuario, id, body.plan));
    }
    if (body.estadoCuenta !== undefined) {
      return respuestaExitosa(await cambiarEstadoCuenta(usuario, id, body.estadoCuenta, body.motivo));
    }
    return respuestaExitosa(await marcarTester(usuario, id, body.esTester));
  } catch (error) {
    return respuestaError(error);
  }
}

// 11-admin.md — borrado físico del usuario (requiere reescribir su email).
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const usuario = await obtenerUsuarioActual();
    if (!usuario) throw new AppError("NO_AUTENTICADO", "Necesitás iniciar sesión.");

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    return respuestaExitosa(await eliminarUsuario(usuario, id, body.confirmacionEmail));
  } catch (error) {
    return respuestaError(error);
  }
}
