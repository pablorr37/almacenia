import { NextRequest } from "next/server";
import { cancelarOrden } from "@/lib/pagos/ordenes";
import { respuestaExitosa, respuestaError } from "@/lib/api-response";
import { usuarioRequerido } from "@/lib/api-sesion";

// 23-puntos-pagos.md
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const usuario = await usuarioRequerido();
    const { id } = await params;
    return respuestaExitosa(await cancelarOrden(usuario, id));
  } catch (error) {
    return respuestaError(error);
  }
}
