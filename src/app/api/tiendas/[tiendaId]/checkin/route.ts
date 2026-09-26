import { NextRequest } from "next/server";
import { hacerCheckIn } from "@/lib/tiendas/checkin";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { respuestaExitosa, respuestaError } from "@/lib/api-response";
import { AppError } from "@/lib/errors";

// 02-tiendas.md — check-in GPS.
export async function POST(request: NextRequest, { params }: { params: Promise<{ tiendaId: string }> }) {
  try {
    const usuario = await obtenerUsuarioActual();
    if (!usuario) throw new AppError("NO_AUTENTICADO", "Necesitás iniciar sesión.");

    const { tiendaId } = await params;
    const body = await request.json().catch(() => ({}));
    const resultado = await hacerCheckIn(usuario, tiendaId, { lat: Number(body.lat), lon: Number(body.lon) });
    return respuestaExitosa(resultado, 201);
  } catch (error) {
    return respuestaError(error);
  }
}
