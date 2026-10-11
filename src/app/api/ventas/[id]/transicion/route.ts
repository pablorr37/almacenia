import { NextRequest } from "next/server";
import { transicionarVenta } from "@/lib/ventas/ventas";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { respuestaExitosa, respuestaError } from "@/lib/api-response";
import { AppError } from "@/lib/errors";

// 05-ventas.md — cobrar / anular una venta de mostrador por cobrar.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const usuario = await obtenerUsuarioActual();
    if (!usuario) throw new AppError("NO_AUTENTICADO", "Necesitás iniciar sesión.");

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    return respuestaExitosa(await transicionarVenta(usuario, id, body.accion));
  } catch (error) {
    return respuestaError(error);
  }
}
