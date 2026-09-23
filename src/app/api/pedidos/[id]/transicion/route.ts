import { NextRequest } from "next/server";
import { transicionarPedido } from "@/lib/pedidos/pedidos";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { respuestaExitosa, respuestaError } from "@/lib/api-response";
import { AppError } from "@/lib/errors";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const usuario = await obtenerUsuarioActual();
    if (!usuario) {
      throw new AppError("NO_AUTENTICADO", "Necesitás iniciar sesión.");
    }

    const { id } = await params;
    const body = await request.json();
    const pedido = await transicionarPedido(usuario, id, body.accion);
    return respuestaExitosa(pedido);
  } catch (error) {
    return respuestaError(error);
  }
}
