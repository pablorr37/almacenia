import { respuestaExitosa } from "@/lib/api-response";

// 22-notificaciones.md: clave VAPID pública (null = push deshabilitado).
export async function GET() {
  return respuestaExitosa({ clavePublica: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || null });
}
