import { NextRequest } from "next/server";
import { moderarCampania } from "@/lib/publicidad/campanias";
import { respuestaExitosa, respuestaError } from "@/lib/api-response";
import { usuarioRequerido } from "@/lib/api-sesion";

// 21-publicidad.md
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await usuarioRequerido();
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    return respuestaExitosa(await moderarCampania(admin, id, { aprobar: body.aprobar === true, motivo: body.motivo }));
  } catch (error) {
    return respuestaError(error);
  }
}
