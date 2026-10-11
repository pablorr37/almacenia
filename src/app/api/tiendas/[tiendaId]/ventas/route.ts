import { NextRequest } from "next/server";
import { crearVentaPresencial, listarVentas } from "@/lib/ventas/ventas";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { respuestaExitosa, respuestaError } from "@/lib/api-response";
import { AppError } from "@/lib/errors";

const ESTADOS = ["por_cobrar", "cobrada", "anulada"] as const;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tiendaId: string }> }
) {
  try {
    const usuario = await obtenerUsuarioActual();
    if (!usuario) {
      throw new AppError("NO_AUTENTICADO", "Necesitás iniciar sesión.");
    }

    const { tiendaId } = await params;
    const body = await request.json().catch(() => ({}));
    const venta = await crearVentaPresencial(usuario, tiendaId, {
      items: body.items,
      medioPago: body.medioPago ?? undefined,
      cobrarAhora: typeof body.cobrarAhora === "boolean" ? body.cobrarAhora : undefined,
      compradorEmail: typeof body.compradorEmail === "string" && body.compradorEmail.trim() ? body.compradorEmail : undefined,
      compradorId: body.compradorId,
      nota: typeof body.nota === "string" ? body.nota : undefined,
    });
    return respuestaExitosa(venta, 201);
  } catch (error) {
    return respuestaError(error);
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tiendaId: string }> }
) {
  try {
    const usuario = await obtenerUsuarioActual();
    if (!usuario) {
      throw new AppError("NO_AUTENTICADO", "Necesitás iniciar sesión.");
    }

    const { tiendaId } = await params;
    const sp = request.nextUrl.searchParams;
    const resultado = await listarVentas(usuario, {
      tiendaId,
      desde: sp.get("desde") ? new Date(sp.get("desde")!) : undefined,
      hasta: sp.get("hasta") ? new Date(sp.get("hasta")!) : undefined,
      estado: ESTADOS.find((e) => e === sp.get("estado")),
      page: sp.get("page") ? Number(sp.get("page")) : undefined,
      pageSize: sp.get("pageSize") ? Number(sp.get("pageSize")) : undefined,
    });
    return respuestaExitosa(resultado.data, 200, {
      page: resultado.page,
      pageSize: resultado.pageSize,
      total: resultado.total,
    });
  } catch (error) {
    return respuestaError(error);
  }
}
