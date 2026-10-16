import { NextRequest } from "next/server";
import { listarMiembros, agregarMiembro } from "@/lib/equipo/equipo";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { respuestaExitosa, respuestaError } from "@/lib/api-response";
import { AppError } from "@/lib/errors";

type Ctx = { params: Promise<{ tiendaId: string }> };

// 19-equipo-tienda.md — equipo de la tienda (permiso 'usuarios').
export async function GET(_request: NextRequest, { params }: Ctx) {
  try {
    const usuario = await obtenerUsuarioActual();
    if (!usuario) throw new AppError("NO_AUTENTICADO", "Necesitás iniciar sesión.");
    const { tiendaId } = await params;
    return respuestaExitosa(await listarMiembros(usuario, tiendaId));
  } catch (error) {
    return respuestaError(error);
  }
}

export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    const usuario = await obtenerUsuarioActual();
    if (!usuario) throw new AppError("NO_AUTENTICADO", "Necesitás iniciar sesión.");
    const { tiendaId } = await params;
    const body = await request.json().catch(() => ({}));
    const miembro = await agregarMiembro(usuario, tiendaId, {
      email: typeof body.email === "string" ? body.email : undefined,
      codigo: typeof body.codigo === "string" ? body.codigo : undefined,
      rol: body.rol,
      permisos: body.permisos,
    });
    return respuestaExitosa(miembro, 201);
  } catch (error) {
    return respuestaError(error);
  }
}
