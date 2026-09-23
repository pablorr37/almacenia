import { NextRequest } from "next/server";
import { buscarTiendasCercanas } from "@/lib/tiendas/tiendas";
import { respuestaExitosa, respuestaError } from "@/lib/api-response";

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const lat = Number(params.get("lat"));
    const lon = Number(params.get("lon"));
    const radioKmParam = params.get("radioKm");

    const resultado = await buscarTiendasCercanas({
      lat,
      lon,
      radioKm: radioKmParam !== null ? Number(radioKmParam) : undefined,
    });
    return respuestaExitosa(resultado);
  } catch (error) {
    return respuestaError(error);
  }
}
