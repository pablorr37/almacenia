import { NextRequest, NextResponse } from "next/server";
import { registrarClic } from "@/lib/publicidad/rotador";

// 21-publicidad.md: registra el clic y redirige al destino guardado de la pieza.
export async function GET(request: NextRequest) {
  let destino = "/";
  try {
    destino = await registrarClic(request.nextUrl.searchParams.get("token") ?? "", request.headers.get("user-agent"));
  } catch (error) {
    console.error("[avisos] clic:", error);
  }
  return NextResponse.redirect(new URL(destino, request.url), { status: 302, headers: { "Cache-Control": "no-store" } });
}
