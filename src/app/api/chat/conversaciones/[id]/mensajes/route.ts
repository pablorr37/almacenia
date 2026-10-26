import { NextRequest } from "next/server";
import { enviarMensaje } from "@/lib/chat/chat";
import { respuestaExitosa, respuestaError } from "@/lib/api-response";
import { usuarioRequerido } from "@/lib/api-sesion";

// 24-chat.md: { texto } o { plantilla }
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const usuario = await usuarioRequerido();
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    return respuestaExitosa(await enviarMensaje(usuario, id, { texto: body.texto, plantilla: body.plantilla }), 201);
  } catch (error) {
    return respuestaError(error);
  }
}
