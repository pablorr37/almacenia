import { NextRequest } from "next/server";
import { compararItems } from "@/lib/itinerario/itinerario";
import { opcionesComparacion } from "@/lib/itinerario/parsear";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { respuestaExitosa, respuestaError } from "@/lib/api-response";
import { AppError } from "@/lib/errors";

// 15-itinerario.md — comparar sin guardar la lista.
export async function POST(request: NextRequest) {
  try {
    const usuario = await obtenerUsuarioActual();
    if (!usuario) throw new AppError("NO_AUTENTICADO", "Necesitás iniciar sesión.");
    const body = await request.json().catch(() => ({}));
    return respuestaExitosa(await compararItems({ ...opcionesComparacion(body), items: body.items }));
  } catch (error) {
    return respuestaError(error);
  }
}
