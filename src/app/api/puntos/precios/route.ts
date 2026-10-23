import { preciosVigentes } from "@/lib/puntos/precios";
import { respuestaExitosa, respuestaError } from "@/lib/api-response";
import { usuarioRequerido } from "@/lib/api-sesion";

// 23-puntos-pagos.md
export async function GET() {
  try {
    await usuarioRequerido();
    return respuestaExitosa(await preciosVigentes());
  } catch (error) {
    return respuestaError(error);
  }
}
