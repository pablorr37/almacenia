import { listarRubros } from "@/lib/rubros-categorias/rubros-categorias";
import { respuestaExitosa, respuestaError } from "@/lib/api-response";

// 17-rubros-categorias.md — público.
export async function GET() {
  try {
    return respuestaExitosa(await listarRubros());
  } catch (error) {
    return respuestaError(error);
  }
}
