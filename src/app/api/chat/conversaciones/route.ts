import { NextRequest } from "next/server";
import { abrirConversacion, listarConversaciones } from "@/lib/chat/chat";
import { respuestaExitosa, respuestaError } from "@/lib/api-response";
import { usuarioRequerido } from "@/lib/api-sesion";

// 24-chat.md
export async function GET(request: NextRequest) {
  try {
    const usuario = await usuarioRequerido();
    return respuestaExitosa(await listarConversaciones(usuario, request.nextUrl.searchParams.get("tiendaId") ?? undefined));
  } catch (error) {
    return respuestaError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const usuario = await usuarioRequerido();
    const body = await request.json().catch(() => ({}));
    return respuestaExitosa(await abrirConversacion(usuario, body.tiendaId), 201);
  } catch (error) {
    return respuestaError(error);
  }
}
