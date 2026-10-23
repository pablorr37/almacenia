import type { MetadataRoute } from "next";

// 21-publicidad.md: no bloquear a los rastreadores (revisión de AdSense); las zonas
// privadas y la API no se indexan.
export default function robots(): MetadataRoute.Robots {
  const base = (process.env.APP_URL || process.env.AUTH_URL || "https://almacenia.store").replace(/\/$/, "");
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/admin", "/mi-tienda", "/perfil", "/notificaciones", "/pedidos", "/ventas"] },
    host: base,
  };
}
