import { NextRequest } from "next/server";
import { valorarCliente, resumenCliente } from "@/lib/valoraciones-clientes/valoraciones-clientes";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { respuestaExitosa, respuestaError } from "@/lib/api-response";
import { AppError } from "@/lib/errors";

type Ctx = { params: Promise<{ compradorId: string }> };

// 13-valoraciones-clientes.md
export async function PUT(request: NextRequest, { params }: Ctx) {
  try {
    const usuario = await obtenerUsuarioActual();
    if (!usuario) throw new AppError("NO_AUTENTICADO", "Necesitás iniciar sesión.");

    const { compradorId } = await params;
    const body = await request.json().catch(() => ({}));
    const valoracion = await valorarCliente(usuario, compradorId, {
      puntuacion: body.puntuacion,
      comentario: typeof body.comentario === "string" ? body.comentario : undefined,
    });
    return respuestaExitosa(valoracion);
  } catch (error) {
    return respuestaError(error);
  }
}

export async function GET(_request: NextRequest, { params }: Ctx) {
  try {
    const usuario = await obtenerUsuarioActual();
    if (!usuario) throw new AppError("NO_AUTENTICADO", "Necesitás iniciar sesión.");

    const { compradorId } = await params;
    return respuestaExitosa(await resumenCliente(usuario, compradorId));
  } catch (error) {
    return respuestaError(error);
  }
}
