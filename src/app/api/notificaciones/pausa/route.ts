import { NextRequest } from "next/server";
import { estadoPausa, pausarNotificaciones } from "@/lib/notificaciones/notificaciones";
import { AppError } from "@/lib/errors";
import { respuestaExitosa, respuestaError } from "@/lib/api-response";
import { usuarioRequerido } from "@/lib/api-sesion";

// 22-notificaciones.md: pausa global ({ hasta: ISO | null }).
export async function GET() {
  try {
    return respuestaExitosa(await estadoPausa(await usuarioRequerido()));
  } catch (error) {
    return respuestaError(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const usuario = await usuarioRequerido();
    const body = await request.json().catch(() => ({}));
    if (body.hasta !== null && typeof body.hasta !== "string") throw new AppError("PAUSA_INVALIDA", "Indicá hasta cuándo pausar.");
    return respuestaExitosa(await pausarNotificaciones(usuario, body.hasta === null ? null : new Date(body.hasta)));
  } catch (error) {
    return respuestaError(error);
  }
}
