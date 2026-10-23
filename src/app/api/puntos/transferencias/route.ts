import { NextRequest } from "next/server";
import { transferirPuntos } from "@/lib/puntos/transferencias";
import { respuestaExitosa, respuestaError } from "@/lib/api-response";
import { usuarioRequerido } from "@/lib/api-sesion";

// 23-puntos-pagos.md
export async function POST(request: NextRequest) {
  try {
    const usuario = await usuarioRequerido();
    const body = await request.json().catch(() => ({}));
    const puntos = typeof body.puntos === "string" ? Number(body.puntos) : body.puntos;
    return respuestaExitosa(await transferirPuntos(usuario, { tiendaId: body.tiendaId, aUsuarioId: body.aUsuarioId, puntos }), 201);
  } catch (error) {
    return respuestaError(error);
  }
}
