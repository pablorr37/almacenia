import { NextRequest } from "next/server";
import { resolverCodigoCliente } from "@/lib/clientes/codigo-cliente";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { respuestaExitosa, respuestaError } from "@/lib/api-response";
import { AppError } from "@/lib/errors";

// 01-auth.md — el vendedor confirma a quién le vende antes de cobrar (solo el nombre).
export async function GET(_request: NextRequest, { params }: { params: Promise<{ codigo: string }> }) {
  try {
    const usuario = await obtenerUsuarioActual();
    if (!usuario) throw new AppError("NO_AUTENTICADO", "Necesitás iniciar sesión.");
    if (!usuario.esVendedor) throw new AppError("FORBIDDEN", "Solo los vendedores pueden consultar códigos de cliente.");
    const { codigo } = await params;
    const { nombre } = await resolverCodigoCliente(decodeURIComponent(codigo));
    return respuestaExitosa({ nombre });
  } catch (error) {
    return respuestaError(error);
  }
}
