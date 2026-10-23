import { NextRequest } from "next/server";
import { configurarRenovacion } from "@/lib/puntos/canjes";
import { respuestaExitosa, respuestaError } from "@/lib/api-response";
import { usuarioRequerido } from "@/lib/api-sesion";

// 23-puntos-pagos.md
export async function PUT(request: NextRequest) {
  try {
    const usuario = await usuarioRequerido();
    const body = await request.json().catch(() => ({}));
    return respuestaExitosa(await configurarRenovacion(usuario, body.modo));
  } catch (error) {
    return respuestaError(error);
  }
}
