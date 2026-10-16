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
      imagenUrl: body.imagenUrl,
      precio: body.precio,
      // 20-precios-facturacion.md
      costo: body.costo,
      margen: body.margen,
      alicuotaIva: body.alicuotaIva,
      impuestosInternos: body.impuestosInternos,
      precioOferta: body.precioOferta,
      destacado: body.destacado,
      stock: body.stock,
      disponible: body.disponible,
      favorito: body.favorito,
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
