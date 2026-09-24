import { NextRequest } from "next/server";
import { obtenerTienda, actualizarTienda } from "@/lib/tiendas/tiendas";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { respuestaExitosa, respuestaError } from "@/lib/api-response";
import { AppError } from "@/lib/errors";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ tiendaId: string }> }) {
  try {
    const { tiendaId } = await params;
    const tienda = await obtenerTienda(tiendaId);
    if (!tienda) {
      throw new AppError("TIENDA_NO_ENCONTRADA", "La tienda no existe.");
    }
    return respuestaExitosa(tienda);
  } catch (error) {
    return respuestaError(error);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ tiendaId: string }> }) {
  try {
    const usuario = await obtenerUsuarioActual();
    if (!usuario) {
      throw new AppError("NO_AUTENTICADO", "Necesitás iniciar sesión.");
    }

    const { tiendaId } = await params;
    const body = await request.json();
    const tienda = await actualizarTienda(usuario, tiendaId, {
      nombre: body.nombre,
      descripcion: body.descripcion,
      direccion: body.direccion,
      lat: body.lat,
      lon: body.lon,
      activa: body.activa,
      imagenUrl: body.imagenUrl,
      rubro: body.rubro,
      mediosDePago: body.mediosDePago,
      horarios: body.horarios,
    });
    return respuestaExitosa(tienda);
  } catch (error) {
    return respuestaError(error);
  }
}
