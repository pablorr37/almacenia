import { NextRequest, NextResponse } from "next/server";
import { sumarAlCatalogo } from "@/lib/catalogo/catalogo";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { respuestaError } from "@/lib/api-response";
import { AppError } from "@/lib/errors";

// 06-catalogo.md — un usuario suma al catálogo un producto que no encuentra (desde su lista).
export async function POST(request: NextRequest) {
  try {
    const usuario = await obtenerUsuarioActual();
    if (!usuario) throw new AppError("NO_AUTENTICADO", "Necesitás iniciar sesión.");
    const body = await request.json().catch(() => ({}));
    const { producto, creado } = await sumarAlCatalogo(usuario, {
      categoriaId: body.categoriaId,
      marca: body.marca ?? undefined,
      variante: body.variante ?? undefined,
      contenido: body.contenido ?? undefined,
      unidadContenido: body.unidadContenido ?? undefined,
      unidad: body.unidad ?? undefined,
    });
    return NextResponse.json({ data: producto, creado }, { status: creado ? 201 : 200 });
  } catch (error) {
    return respuestaError(error);
  }
}
