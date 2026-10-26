import { NextRequest } from "next/server";
import { ajustarItem } from "@/lib/pedidos/ajustes";
import { respuestaExitosa, respuestaError } from "@/lib/api-response";
import { usuarioRequerido } from "@/lib/api-sesion";

// 04-pedidos.md, "Ajuste de peso"
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  try {
    const usuario = await usuarioRequerido();
    const { id, itemId } = await params;
    const body = await request.json().catch(() => ({}));
    return respuestaExitosa(
      await ajustarItem(usuario, id, itemId, {
        accion: body.accion,
        cantidad: body.cantidad !== undefined ? Number(body.cantidad) : undefined,
        importe: body.importe !== undefined ? Number(body.importe) : undefined,
      })
    );
  } catch (error) {
    return respuestaError(error);
  }
}
