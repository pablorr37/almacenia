import { NextRequest } from "next/server";
import { contarSegmento } from "@/lib/notificaciones/envios";
import { respuestaExitosa, respuestaError } from "@/lib/api-response";
import { usuarioRequerido } from "@/lib/api-sesion";

// 22-notificaciones.md: vista previa del conteo del segmento.
export async function POST(request: NextRequest) {
  try {
    const admin = await usuarioRequerido();
    const body = await request.json().catch(() => ({}));
    return respuestaExitosa({ cantidad: await contarSegmento(admin, body.segmento ?? {}) });
  } catch (error) {
    return respuestaError(error);
  }
}
