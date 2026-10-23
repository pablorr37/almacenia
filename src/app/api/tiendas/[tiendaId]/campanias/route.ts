import { NextRequest } from "next/server";
import { crearCampania, listarCampaniasTienda } from "@/lib/publicidad/campanias";
import type { EspacioAviso } from "@/lib/publicidad/reglas";
import type { PagoCampania } from "@/generated-prisma/client";
import { respuestaExitosa, respuestaError } from "@/lib/api-response";
import { usuarioRequerido } from "@/lib/api-sesion";

type Ctx = { params: Promise<{ tiendaId: string }> };

// 21-publicidad.md
export async function GET(_request: NextRequest, { params }: Ctx) {
  try {
    const usuario = await usuarioRequerido();
    const { tiendaId } = await params;
    return respuestaExitosa(await listarCampaniasTienda(usuario, tiendaId));
  } catch (error) {
    return respuestaError(error);
  }
}

export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    const usuario = await usuarioRequerido();
    const { tiendaId } = await params;
    const form = await request.formData();
    const texto = (k: string) => {
      const v = form.get(k);
      return typeof v === "string" ? v : null;
    };
    const archivo = form.get("imagen");
    const imagen =
      archivo instanceof File && archivo.size > 0
        ? { buffer: Buffer.from(await archivo.arrayBuffer()), contentType: archivo.type }
        : null;
    const resultado = await crearCampania(usuario, tiendaId, {
      espacio: texto("espacio") as EspacioAviso,
      titulo: texto("titulo") ?? "",
      desde: texto("desde") ?? "",
      dias: Number(texto("dias")),
      pago: texto("pago") as PagoCampania,
      texto: texto("texto"),
      destino: texto("destino"),
      radioKm: texto("radioKm") ? Number(texto("radioKm")) : null,
      imagen,
    });
    return respuestaExitosa(resultado, 201);
  } catch (error) {
    return respuestaError(error);
  }
}
