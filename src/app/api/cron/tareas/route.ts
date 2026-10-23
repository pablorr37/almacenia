import { NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { respuestaExitosa, respuestaError } from "@/lib/api-response";
import { AppError } from "@/lib/errors";
import { vencerPlanes } from "@/lib/puntos/canjes";
import { actualizarDiasCampanias } from "@/lib/publicidad/campanias";
import { procesarPublicidadPush } from "@/lib/publicidad/push";
import { procesarEnvios } from "@/lib/notificaciones/envios";

// 23-puntos-pagos.md: tareas programadas (Coolify, cada hora). Cada una por separado:
// si una falla, las demás corren igual.
async function aparte<T>(nombre: string, fn: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await fn();
  } catch (error) {
    console.error(`[cron] ${nombre} falló:`, error);
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

function tokenValido(recibido: string, esperado: string): boolean {
  const a = Buffer.from(recibido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  try {
    const esperado = process.env.CRON_TOKEN;
    if (!esperado) throw new AppError("CRON_NO_CONFIGURADO", "Falta configurar CRON_TOKEN.");
    const recibido = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!tokenValido(recibido, esperado)) throw new AppError("NO_AUTENTICADO", "Token inválido.");
    const ahora = new Date();
    return respuestaExitosa({
      planes: await aparte("planes", () => vencerPlanes(ahora)),
      campanias: await aparte("campanias", () => actualizarDiasCampanias(ahora)),
      publicidadPush: await aparte("publicidadPush", () => procesarPublicidadPush(ahora)),
      envios: await aparte("envios", () => procesarEnvios()),
    });
  } catch (error) {
    return respuestaError(error);
  }
}
