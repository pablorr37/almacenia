import { NextRequest } from "next/server";
import { confirmarOrdenManual } from "@/lib/pagos/ordenes";
import { respuestaExitosa, respuestaError } from "@/lib/api-response";
import { usuarioRequerido } from "@/lib/api-sesion";

// 23-puntos-pagos.md
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await usuarioRequerido();
    const { id } = await params;
    return respuestaExitosa(await confirmarOrdenManual(admin, id));
  } catch (error) {
    return respuestaError(error);
  }
}
