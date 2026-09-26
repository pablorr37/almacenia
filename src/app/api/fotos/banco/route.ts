import { NextRequest } from "next/server";
import { buscarEnBanco, aprobarFotoWeb, subirFotoBanco } from "@/lib/fotos/banco";
import type { ResultadoWeb } from "@/lib/fotos/buscador-web";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { respuestaExitosa, respuestaError } from "@/lib/api-response";
import { AppError } from "@/lib/errors";

// 16-banco-fotos.md — búsqueda en el banco (visibilidad según rol y plan).
export async function GET(request: NextRequest) {
  try {
    const usuario = await obtenerUsuarioActual();
    if (!usuario) throw new AppError("NO_AUTENTICADO", "Necesitás iniciar sesión.");

    const sp = request.nextUrl.searchParams;
    const resultado = await buscarEnBanco(usuario, sp.get("q") ?? "", {
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

function esResultadoWeb(valor: unknown): valor is ResultadoWeb {
  const r = valor as Partial<ResultadoWeb> | null;
  return typeof r?.origenUrl === "string" && typeof r.imagenUrl === "string";
}

// JSON { resultado, etiquetas } → aprobar foto web (curadores).
// multipart { archivo, etiquetas: "a, b" } → subir foto propia.
export async function POST(request: NextRequest) {
  try {
    const usuario = await obtenerUsuarioActual();
    if (!usuario) throw new AppError("NO_AUTENTICADO", "Necesitás iniciar sesión.");

    if ((request.headers.get("content-type") ?? "").includes("multipart/form-data")) {
      const form = await request.formData();
      const archivo = form.get("archivo");
      if (!(archivo instanceof Blob)) {
        throw new AppError("ARCHIVO_FALTANTE", "Falta el campo 'archivo' en el form-data.");
      }
      const etiquetas = String(form.get("etiquetas") ?? "")
        .split(",")
        .map((e) => e.trim())
        .filter((e) => e.length > 0);
      const foto = await subirFotoBanco(
        usuario,
        { contentType: archivo.type, buffer: Buffer.from(await archivo.arrayBuffer()) },
        etiquetas
      );
      return respuestaExitosa(foto, 201);
    }

    const body = await request.json().catch(() => ({}));
    if (!esResultadoWeb(body.resultado)) {
      throw new AppError("RESULTADO_WEB_INVALIDO", "Falta el resultado de la búsqueda web a aprobar.");
    }
    const foto = await aprobarFotoWeb(usuario, body.resultado, body.etiquetas);
    return respuestaExitosa(foto, 201);
  } catch (error) {
    return respuestaError(error);
  }
}
