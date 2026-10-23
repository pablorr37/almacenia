import { NextRequest } from "next/server";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { respuestaExitosa, respuestaError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { elegirAviso } from "@/lib/publicidad/rotador";
import type { EspacioAviso } from "@/lib/publicidad/reglas";

export const dynamic = "force-dynamic";

// 21-publicidad.md: público; sin sesión = invitado.
export async function GET(request: NextRequest) {
  try {
    const usuario = await obtenerUsuarioActual();
    const sp = request.nextUrl.searchParams;
    const lat = sp.get("lat") !== null ? Number(sp.get("lat")) : undefined;
    const lon = sp.get("lon") !== null ? Number(sp.get("lon")) : undefined;
    const aviso = await elegirAviso({
      espacio: sp.get("espacio") as EspacioAviso,
      usuarioId: usuario?.id ?? null,
      lat: Number.isFinite(lat) ? lat : undefined,
      lon: Number.isFinite(lon) ? lon : undefined,
    });
    // Premium y plata no ven publicidad: la UI ni siquiera reserva el espacio.
    const plan = usuario ? (await prisma.usuario.findUnique({ where: { id: usuario.id }, select: { plan: true } }))?.plan : "free";
    return respuestaExitosa({ aviso, conPublicidad: (plan ?? "free") === "free" });
  } catch (error) {
    return respuestaError(error);
  }
}
