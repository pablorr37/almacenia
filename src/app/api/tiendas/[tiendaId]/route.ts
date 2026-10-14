import { NextRequest } from "next/server";
import { obtenerTiendaPublica, actualizarTienda } from "@/lib/tiendas/tiendas";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { respuestaExitosa, respuestaError } from "@/lib/api-response";
import { AppError } from "@/lib/errors";

// Datos vivos (tiendas visibles según estado de cuenta): siempre en el momento (00-overview.md, "Sin caché").
export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ tiendaId: string }> }) {
  try {
    const { tiendaId } = await params;
    const tienda = await obtenerTiendaPublica(tiendaId);
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
      rubroId: body.rubroId,
      mediosDePago: body.mediosDePago,
      abierto24hs: body.abierto24hs,
      horarios: body.horarios,
    });
    return respuestaExitosa(tienda);
  } catch (error) {
    return respuestaError(error);
  }
}
