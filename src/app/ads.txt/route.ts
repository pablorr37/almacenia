// 21-publicidad.md: ads.txt desde la variable ADS_TXT (una línea por proveedor; se
// aceptan saltos reales o "\n" literales). 404 si no está configurada.
export const dynamic = "force-dynamic";

export async function GET() {
  const contenido = (process.env.ADS_TXT ?? "").replace(/\\n/g, "\n").trim();
  if (!contenido) return new Response("Not found", { status: 404 });
  return new Response(`${contenido}\n`, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
