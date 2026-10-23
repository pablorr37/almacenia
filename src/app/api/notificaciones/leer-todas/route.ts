import { NextResponse } from "next/server";
import { marcarTodasLeidas } from "@/lib/notificaciones/notificaciones";
import { respuestaError } from "@/lib/api-response";
import { usuarioRequerido } from "@/lib/api-sesion";

// 22-notificaciones.md
export async function POST() {
  try {
    await marcarTodasLeidas(await usuarioRequerido());
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return respuestaError(error);
  }
}
