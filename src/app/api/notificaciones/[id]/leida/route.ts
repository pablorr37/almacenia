import { NextRequest, NextResponse } from "next/server";
import { marcarLeida } from "@/lib/notificaciones/notificaciones";
import { respuestaError } from "@/lib/api-response";
import { usuarioRequerido } from "@/lib/api-sesion";

// 22-notificaciones.md
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const usuario = await usuarioRequerido();
    const { id } = await params;
    await marcarLeida(usuario, id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return respuestaError(error);
  }
}
