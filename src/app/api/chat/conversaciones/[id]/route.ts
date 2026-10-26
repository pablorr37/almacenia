import { NextRequest } from "next/server";
import { obtenerConversacion } from "@/lib/chat/chat";
import { respuestaExitosa, respuestaError } from "@/lib/api-response";
import { usuarioRequerido } from "@/lib/api-sesion";

// 24-chat.md: también marca como leídos los mensajes de la otra parte.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const usuario = await usuarioRequerido();
    const { id } = await params;
    return respuestaExitosa(await obtenerConversacion(usuario, id));
  } catch (error) {
    return respuestaError(error);
  }
}
