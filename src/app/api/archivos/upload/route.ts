import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { subirArchivo, type TipoArchivo } from "@/lib/archivos/archivos";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { respuestaExitosa, respuestaError } from "@/lib/api-response";
import { AppError } from "@/lib/errors";
import type { Usuario } from "@/lib/auth/auth";
import { tienePermiso } from "@/lib/planes/planes";
import { verificarPermisoFotoCatalogo } from "@/lib/catalogo/catalogo";

async function verificarOwnership(usuario: Usuario, tipo: TipoArchivo, entidadId: string): Promise<void> {
  const usuarioId = usuario.id;
  if (tipo === "avatar") {
    if (entidadId !== usuarioId) {
      throw new AppError("FORBIDDEN", "Solo podés subir tu propio avatar.");
    }
    return;
  }

  if (tipo === "tienda") {
    const tienda = await prisma.tienda.findUnique({ where: { id: entidadId } });
    if (!tienda) throw new AppError("TIENDA_NO_ENCONTRADA", "La tienda no existe.");
    if (tienda.vendedorId !== usuarioId) {
      throw new AppError("NO_ES_DUENO_DE_TIENDA", "No sos el dueño de esta tienda.");
    }
    return;
  }

  if (tipo === "catalogo") {
    // Foto compartida del catálogo (06-catalogo.md): admin, o premium si no tiene foto.
    await verificarPermisoFotoCatalogo(usuario, entidadId);
    return;
  }

  // Foto personalizada de un producto de la tienda: feature fotos_personalizadas
  // (10-planes.md), solo premium.
  const producto = await prisma.producto.findUnique({ where: { id: entidadId }, include: { tienda: true } });
  if (!producto) throw new AppError("PRODUCTO_NO_ENCONTRADO", "El producto no existe.");
  if (producto.tienda.vendedorId !== usuarioId) {
    throw new AppError("NO_ES_DUENO_DE_TIENDA", "No sos el dueño de esta tienda.");
  }
  if (!tienePermiso(producto.tienda, "fotos_personalizadas")) {
    throw new AppError("FOTOS_SOLO_PREMIUM", "Las fotos propias de productos son del plan premium.");
  }
}

const TIPOS_VALIDOS: TipoArchivo[] = ["tienda", "producto", "catalogo", "avatar"];

export async function POST(request: NextRequest) {
  try {
    const usuario = await obtenerUsuarioActual();
    if (!usuario) {
      throw new AppError("NO_AUTENTICADO", "Necesitás iniciar sesión.");
    }

    const sp = request.nextUrl.searchParams;
    const tipo = sp.get("tipo") as TipoArchivo | null;
    const entidadId = tipo === "avatar" ? usuario.id : sp.get("entidadId");
    if (!tipo || !TIPOS_VALIDOS.includes(tipo) || !entidadId) {
      throw new AppError("TIPO_ARCHIVO_INVALIDO", "Faltan o son inválidos los parámetros tipo/entidadId.");
    }

    await verificarOwnership(usuario, tipo, entidadId);

    const formData = await request.formData();
    const archivo = formData.get("archivo");
    if (!(archivo instanceof Blob)) {
      throw new AppError("ARCHIVO_FALTANTE", "Falta el campo 'archivo' en el form-data.");
    }

    const buffer = Buffer.from(await archivo.arrayBuffer());
    const resultado = await subirArchivo({
      tipo,
      entidadId,
      contentType: archivo.type,
      buffer,
    });

    return respuestaExitosa(resultado, 201);
  } catch (error) {
    return respuestaError(error);
  }
}
