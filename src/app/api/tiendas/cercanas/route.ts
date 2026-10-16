import { NextRequest } from "next/server";
import { buscarTiendasCercanas } from "@/lib/tiendas/tiendas";
import { respuestaExitosa, respuestaError } from "@/lib/api-response";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { obtenerAlcance } from "@/lib/alcance/alcance";

// Datos vivos (tiendas visibles según estado de cuenta): siempre en el momento (00-overview.md, "Sin caché").
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const lat = Number(params.get("lat"));
    const lon = Number(params.get("lon"));
    const radioKmParam = params.get("radioKm");

    // 18-alcance.md: con sesión, el radio se limita al alcance del usuario.
    const usuario = await obtenerUsuarioActual();
    const alcance = usuario ? await obtenerAlcance(usuario.id) : null;

    const resultado = await buscarTiendasCercanas({
      lat,
      lon,
      radioKm: radioKmParam !== null ? Number(radioKmParam) : undefined,
      alcanceKm: alcance ? alcance.radioKm : undefined,
    });
    return respuestaExitosa(resultado);
  } catch (error) {
    return respuestaError(error);
  }
}
