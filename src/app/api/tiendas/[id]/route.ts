import { NextRequest } from "next/server";
import { obtenerTienda, actualizarTienda } from "@/lib/tiendas/tiendas";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { respuestaExitosa, respuestaError } from "@/lib/api-response";
import { AppError } from "@/lib/errors";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const tienda = await obtenerTienda(id);
    if (!tienda) {
      throw new AppError("TIENDA_NO_ENCONTRADA", "La tienda no existe.");
    }
    return respuestaExitosa(tienda);
  } catch (error) {
    return respuestaError(error);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const usuario = await obtenerUsuarioActual();
    if (!usuario) {
      throw new AppError("NO_AUTENTICADO", "Necesitás iniciar sesión.");
    }

    const { id } = await params;
    const body = await request.json();
    const tienda = await actualizarTienda(usuario, id, {
      nombre: body.nombre,
      descripcion: body.descripcion,
      direccion: body.direccion,
      lat: body.lat,
      lon: body.lon,
      activa: body.activa,
    });
    return respuestaExitosa(tienda);
  } catch (error) {
    return respuestaError(error);
  }
}
