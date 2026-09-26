import { NextRequest } from "next/server";
import { buscarWeb } from "@/lib/fotos/buscador-web";
import { esCurador } from "@/lib/fotos/banco";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { respuestaExitosa, respuestaError } from "@/lib/api-response";
import { AppError } from "@/lib/errors";

// 16-banco-fotos.md — búsqueda de fotos libres en la web. Solo curadores.
export async function GET(request: NextRequest) {
  try {
    const usuario = await obtenerUsuarioActual();
    if (!usuario) throw new AppError("NO_AUTENTICADO", "Necesitás iniciar sesión.");
    if (!esCurador(usuario)) throw new AppError("SOLO_CURADORES", "Solo admins y testers pueden buscar en la web.");

    return respuestaExitosa(await buscarWeb(request.nextUrl.searchParams.get("q") ?? ""));
  } catch (error) {
    return respuestaError(error);
  }
}
