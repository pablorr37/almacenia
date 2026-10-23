import { canjearPremium } from "@/lib/puntos/canjes";
import { respuestaExitosa, respuestaError } from "@/lib/api-response";
import { usuarioRequerido } from "@/lib/api-sesion";

// 23-puntos-pagos.md
export async function POST() {
  try {
    return respuestaExitosa(await canjearPremium(await usuarioRequerido()));
  } catch (error) {
    return respuestaError(error);
  }
}
