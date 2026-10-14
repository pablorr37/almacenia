import { NextRequest } from "next/server";
import { crearRubro } from "@/lib/rubros-categorias/rubros-categorias";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { respuestaExitosa, respuestaError } from "@/lib/api-response";
import { AppError } from "@/lib/errors";

// 17-rubros-categorias.md — solo admin.
export async function POST(request: NextRequest) {
  try {
    const usuario = await obtenerUsuarioActual();
    if (!usuario) throw new AppError("NO_AUTENTICADO", "Necesitás iniciar sesión.");
    const body = await request.json().catch(() => ({}));
    return respuestaExitosa(await crearRubro(usuario, { nombre: body.nombre, orden: body.orden }), 201);
  } catch (error) {
    return respuestaError(error);
  }
}
