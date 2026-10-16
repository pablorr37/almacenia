import { NextRequest } from "next/server";
import { libroVentasCsv } from "@/lib/ventas/balance";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { respuestaError } from "@/lib/api-response";
import { AppError } from "@/lib/errors";

type Ctx = { params: Promise<{ tiendaId: string }> };

// 20-precios-facturacion.md — libro de ventas (plata), una fila por ítem cobrado.
export async function GET(request: NextRequest, { params }: Ctx) {
  try {
    const usuario = await obtenerUsuarioActual();
    if (!usuario) throw new AppError("NO_AUTENTICADO", "Necesitás iniciar sesión.");
    const { tiendaId } = await params;
    const sp = request.nextUrl.searchParams;
    const desde = sp.get("desde") ?? undefined;
    const hasta = sp.get("hasta") ?? undefined;
    const csv = await libroVentasCsv(usuario, tiendaId, { desde, hasta });
    const nombre = `libro-ventas-${desde ?? "inicio"}-a-${hasta ?? "hoy"}.csv`;
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${nombre}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return respuestaError(error);
  }
}
