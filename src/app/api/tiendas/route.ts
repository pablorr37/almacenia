import { NextRequest } from "next/server";
import { crearTienda } from "@/lib/tiendas/tiendas";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { respuestaExitosa, respuestaError } from "@/lib/api-response";
import { AppError } from "@/lib/errors";

export async function POST(request: NextRequest) {
  try {
    const usuario = await obtenerUsuarioActual();
    if (!usuario) {
      throw new AppError("NO_AUTENTICADO", "Necesitás iniciar sesión.");
    }

    const body = await request.json();
    const tienda = await crearTienda(usuario, {
      nombre: body.nombre,
      descripcion: body.descripcion,
      direccion: body.direccion,
      lat: body.lat,
      lon: body.lon,
    });
    return respuestaExitosa(tienda, 201);
  } catch (error) {
    return respuestaError(error);
  }
}
