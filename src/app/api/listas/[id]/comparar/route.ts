import { NextRequest } from "next/server";
import { compararLista } from "@/lib/itinerario/itinerario";
import { opcionesComparacion } from "@/lib/itinerario/parsear";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { respuestaExitosa, respuestaError } from "@/lib/api-response";
import { AppError } from "@/lib/errors";

// 15-itinerario.md — "Buscar y comparar" sobre una lista guardada.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const usuario = await obtenerUsuarioActual();
    if (!usuario) throw new AppError("NO_AUTENTICADO", "Necesitás iniciar sesión.");
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    return respuestaExitosa(await compararLista(usuario, id, opcionesComparacion(body)));
  } catch (error) {
    return respuestaError(error);
  }
}
