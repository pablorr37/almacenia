import { NextRequest, NextResponse } from "next/server";
import { respuestaError } from "@/lib/api-response";
import { registrarImpresion } from "@/lib/publicidad/rotador";

// 21-publicidad.md: llega por sendBeacon (texto plano) o JSON { token }.
export async function POST(request: NextRequest) {
  try {
    const crudo = await request.text();
    let token = crudo.trim();
    if (token.startsWith("{")) {
      try {
        token = String(JSON.parse(token).token ?? "");
      } catch {
        token = "";
      }
    }
    await registrarImpresion(token, request.headers.get("user-agent"));
    return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return respuestaError(error);
  }
}
