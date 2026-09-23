import { NextRequest } from "next/server";
import { obtenerPedido } from "@/lib/pedidos/pedidos";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { respuestaExitosa, respuestaError } from "@/lib/api-response";
import { AppError } from "@/lib/errors";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const usuario = await obtenerUsuarioActual();
    if (!usuario) {
      throw new AppError("NO_AUTENTICADO", "Necesitás iniciar sesión.");
    }

    const { id } = await params;
    const pedido = await obtenerPedido(usuario, id);
    if (!pedido) {
      throw new AppError("PEDIDO_NO_ENCONTRADO", "El pedido no existe.");
    }
    return respuestaExitosa(pedido);
  } catch (error) {
    return respuestaError(error);
  }
}
