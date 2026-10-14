import { NextRequest } from "next/server";
import { listarCategorias } from "@/lib/rubros-categorias/rubros-categorias";
import { respuestaExitosa, respuestaError } from "@/lib/api-response";

// 17-rubros-categorias.md — público, con filtro opcional ?q=.
export async function GET(request: NextRequest) {
  try {
    return respuestaExitosa(await listarCategorias(request.nextUrl.searchParams.get("q") ?? undefined));
  } catch (error) {
    return respuestaError(error);
  }
}
