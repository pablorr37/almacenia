import { NextRequest } from "next/server";
import { registrarVisitaPagina } from "@/lib/gamificacion/gamificacion";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { respuestaExitosa, respuestaError } from "@/lib/api-response";
import { AppError } from "@/lib/errors";

// 02-tiendas.md / 12-gamificacion.md — visita a la página de la tienda.
export async function POST(_request: NextRequest, { params }: { params: Promise<{ tiendaId: string }> }) {
  try {
    const usuario = await obtenerUsuarioActual();
    if (!usuario) throw new AppError("NO_AUTENTICADO", "Necesitás iniciar sesión.");

    const { tiendaId } = await params;
    const puntosOtorgados = await registrarVisitaPagina(usuario, tiendaId);
    return respuestaExitosa({ puntosOtorgados });
  } catch (error) {
    return respuestaError(error);
  }
}
