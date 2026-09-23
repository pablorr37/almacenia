import { NextRequest } from "next/server";
import { actualizarProducto, eliminarProducto } from "@/lib/productos/productos";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { respuestaExitosa, respuestaError } from "@/lib/api-response";
import { AppError } from "@/lib/errors";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const usuario = await obtenerUsuarioActual();
    if (!usuario) {
      throw new AppError("NO_AUTENTICADO", "Necesitás iniciar sesión.");
    }

    const { id } = await params;
    const body = await request.json();
    const producto = await actualizarProducto(usuario, id, {
      nombre: body.nombre,
      descripcion: body.descripcion,
      precio: body.precio,
      stock: body.stock,
      disponible: body.disponible,
    });
    return respuestaExitosa(producto);
  } catch (error) {
    return respuestaError(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const usuario = await obtenerUsuarioActual();
    if (!usuario) {
      throw new AppError("NO_AUTENTICADO", "Necesitás iniciar sesión.");
    }

    const { id } = await params;
    const producto = await eliminarProducto(usuario, id);
    return respuestaExitosa(producto);
  } catch (error) {
    return respuestaError(error);
  }
}
