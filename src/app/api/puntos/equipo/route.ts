import { NextRequest } from "next/server";
import { equipoParaTransferir } from "@/lib/puntos/transferencias";
import { respuestaExitosa, respuestaError } from "@/lib/api-response";
import { usuarioRequerido } from "@/lib/api-sesion";

// 23-puntos-pagos.md: a quién se le puede transferir en esa tienda.
export async function GET(request: NextRequest) {
  try {
    const usuario = await usuarioRequerido();
    return respuestaExitosa(await equipoParaTransferir(usuario, request.nextUrl.searchParams.get("tiendaId") ?? ""));
  } catch (error) {
    return respuestaError(error);
  }
}
