import { NextRequest, NextResponse } from "next/server";
import { borrarSuscripcion, guardarSuscripcion } from "@/lib/notificaciones/notificaciones";
import { respuestaError } from "@/lib/api-response";
import { usuarioRequerido } from "@/lib/api-sesion";

// 22-notificaciones.md
export async function POST(request: NextRequest) {
  try {
    const usuario = await usuarioRequerido();
    const body = await request.json().catch(() => ({}));
    await guardarSuscripcion(usuario, body, request.headers.get("user-agent"));
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return respuestaError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const usuario = await usuarioRequerido();
    const body = await request.json().catch(() => ({}));
    await borrarSuscripcion(usuario, typeof body.endpoint === "string" ? body.endpoint : "");
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return respuestaError(error);
  }
}
