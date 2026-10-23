import { NextRequest } from "next/server";
import { guardarPreferencia, obtenerPreferencias } from "@/lib/notificaciones/notificaciones";
import { respuestaExitosa, respuestaError } from "@/lib/api-response";
import { usuarioRequerido } from "@/lib/api-sesion";

// 22-notificaciones.md
export async function GET() {
  try {
    return respuestaExitosa(await obtenerPreferencias(await usuarioRequerido()));
  } catch (error) {
    return respuestaError(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const usuario = await usuarioRequerido();
    const body = await request.json().catch(() => ({}));
    return respuestaExitosa(await guardarPreferencia(usuario, body));
  } catch (error) {
    return respuestaError(error);
  }
}
