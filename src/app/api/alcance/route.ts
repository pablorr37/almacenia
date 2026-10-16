import { obtenerAlcance } from "@/lib/alcance/alcance";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { respuestaExitosa, respuestaError } from "@/lib/api-response";

// 18-alcance.md — radio de alcance del usuario (o de invitado, sin sesión).
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const usuario = await obtenerUsuarioActual();
    return respuestaExitosa(await obtenerAlcance(usuario?.id ?? null));
  } catch (error) {
    return respuestaError(error);
  }
}
