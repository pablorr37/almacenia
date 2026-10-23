import { NextRequest } from "next/server";
import { finalizarCampania, pausarCampania, reanudarCampania } from "@/lib/publicidad/campanias";
import { AppError } from "@/lib/errors";
import { respuestaExitosa, respuestaError } from "@/lib/api-response";
import { usuarioRequerido } from "@/lib/api-sesion";

const ACCIONES = { pausar: pausarCampania, reanudar: reanudarCampania, finalizar: finalizarCampania } as const;

// 21-publicidad.md: POST /api/campanias/:id/pausar | reanudar | finalizar
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string; accion: string }> }) {
  try {
    const usuario = await usuarioRequerido();
    const { id, accion } = await params;
    const fn = ACCIONES[accion as keyof typeof ACCIONES];
    if (!fn) throw new AppError("ACCION_INVALIDA", "Esa acción no existe.");
    return respuestaExitosa(await fn(usuario, id));
  } catch (error) {
    return respuestaError(error);
  }
}
