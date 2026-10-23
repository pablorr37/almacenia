import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/auth";
import { cancelarOrden } from "@/lib/pagos/ordenes";
import { respuestaExitosa, respuestaError } from "@/lib/api-response";
import { usuarioRequerido } from "@/lib/api-sesion";

// 23-puntos-pagos.md
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await usuarioRequerido();
    requireAdmin(admin);
    const { id } = await params;
    return respuestaExitosa(await cancelarOrden(admin, id));
  } catch (error) {
    return respuestaError(error);
  }
}
