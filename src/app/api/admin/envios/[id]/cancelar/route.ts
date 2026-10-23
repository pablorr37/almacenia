import { NextRequest } from "next/server";
import { cancelarEnvio } from "@/lib/notificaciones/envios";
import { respuestaExitosa, respuestaError } from "@/lib/api-response";
import { usuarioRequerido } from "@/lib/api-sesion";

// 22-notificaciones.md
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await usuarioRequerido();
    const { id } = await params;
    return respuestaExitosa(await cancelarEnvio(admin, id));
  } catch (error) {
    return respuestaError(error);
  }
}
