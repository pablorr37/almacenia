import { NextRequest } from "next/server";
import { crearProducto, listarProductos } from "@/lib/productos/productos";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { respuestaExitosa, respuestaError } from "@/lib/api-response";
import { AppError } from "@/lib/errors";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tiendaId: string }> }
) {
  try {
    const usuario = await obtenerUsuarioActual();
    if (!usuario) {
      throw new AppError("NO_AUTENTICADO", "Necesitás iniciar sesión.");
    }

    const { tiendaId } = await params;
    const body = await request.json();
    const producto = await crearProducto(usuario, tiendaId, {
      nombre: body.nombre,
      descripcion: body.descripcion,
      precio: body.precio,
      stock: body.stock,
    });
    return respuestaExitosa(producto, 201);
  } catch (error) {
    return respuestaError(error);
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tiendaId: string }> }
) {
  try {
    const { tiendaId } = await params;
    const sp = request.nextUrl.searchParams;
    const resultado = await listarProductos({
      tiendaId,
      soloDisponibles: sp.get("soloDisponibles") === "true",
      page: sp.get("page") ? Number(sp.get("page")) : undefined,
      pageSize: sp.get("pageSize") ? Number(sp.get("pageSize")) : undefined,
    });
    return respuestaExitosa(resultado.data, 200, {
      page: resultado.page,
      pageSize: resultado.pageSize,
      total: resultado.total,
    });
  } catch (error) {
    return respuestaError(error);
  }
}
