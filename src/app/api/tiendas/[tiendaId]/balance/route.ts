import { NextRequest } from "next/server";
import { balanceTienda } from "@/lib/ventas/balance";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { respuestaExitosa, respuestaError } from "@/lib/api-response";
import { AppError } from "@/lib/errors";

type Ctx = { params: Promise<{ tiendaId: string }> };

// 19-equipo-tienda.md — balance básico (permiso 'balance').
export async function GET(request: NextRequest, { params }: Ctx) {
  try {
    const usuario = await obtenerUsuarioActual();
    if (!usuario) throw new AppError("NO_AUTENTICADO", "Necesitás iniciar sesión.");
    const { tiendaId } = await params;
    const sp = request.nextUrl.searchParams;
    return respuestaExitosa(
      await balanceTienda(usuario, tiendaId, { desde: sp.get("desde") ?? undefined, hasta: sp.get("hasta") ?? undefined })
    );
  } catch (error) {
    return respuestaError(error);
  }
}
