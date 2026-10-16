import { NextRequest } from "next/server";
import { emitirComprobante, obtenerComprobante } from "@/lib/facturacion/comprobantes";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { respuestaExitosa, respuestaError } from "@/lib/api-response";
import { AppError } from "@/lib/errors";

type Ctx = { params: Promise<{ id: string }> };

// 20-precios-facturacion.md — comprobante de una venta cobrada.
export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    const usuario = await obtenerUsuarioActual();
    if (!usuario) throw new AppError("NO_AUTENTICADO", "Necesitás iniciar sesión.");
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    return respuestaExitosa(await emitirComprobante(usuario, id, body.cliente ?? undefined), 201);
  } catch (error) {
    return respuestaError(error);
  }
}

export async function GET(_request: NextRequest, { params }: Ctx) {
  try {
    const usuario = await obtenerUsuarioActual();
    if (!usuario) throw new AppError("NO_AUTENTICADO", "Necesitás iniciar sesión.");
    const { id } = await params;
    return respuestaExitosa(await obtenerComprobante(usuario, id));
  } catch (error) {
    return respuestaError(error);
  }
}
