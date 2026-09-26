import { NextRequest } from "next/server";
import { buscarEnCatalogo } from "@/lib/catalogo/catalogo";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { respuestaExitosa, respuestaError } from "@/lib/api-response";
import { AppError } from "@/lib/errors";

export async function GET(request: NextRequest) {
  try {
    const usuario = await obtenerUsuarioActual();
    if (!usuario) {
      throw new AppError("NO_AUTENTICADO", "Necesitás iniciar sesión.");
    }

    const sp = request.nextUrl.searchParams;
    const resultado = await buscarEnCatalogo({
      q: sp.get("q") ?? undefined,
      codigoBarras: sp.get("codigoBarras") ?? undefined,
    });
    return respuestaExitosa(resultado);
  } catch (error) {
    return respuestaError(error);
  }
}
