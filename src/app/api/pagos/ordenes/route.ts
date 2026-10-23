import { NextRequest } from "next/server";
import { crearOrdenPremium, listarMisOrdenes } from "@/lib/pagos/ordenes";
import { AppError } from "@/lib/errors";
import { respuestaExitosa, respuestaError } from "@/lib/api-response";
import { usuarioRequerido } from "@/lib/api-sesion";

// 23-puntos-pagos.md: las órdenes de publicidad se crean con la campaña.
export async function POST(request: NextRequest) {
  try {
    const usuario = await usuarioRequerido();
    const body = await request.json().catch(() => ({}));
    if (body.concepto !== "premium") throw new AppError("CONCEPTO_INVALIDO", "Solo se pueden crear órdenes de premium.");
    return respuestaExitosa(await crearOrdenPremium(usuario), 201);
  } catch (error) {
    return respuestaError(error);
  }
}

export async function GET() {
  try {
    return respuestaExitosa(await listarMisOrdenes(await usuarioRequerido()));
  } catch (error) {
    return respuestaError(error);
  }
}
