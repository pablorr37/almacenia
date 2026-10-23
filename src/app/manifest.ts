import type { MetadataRoute } from "next";

// PWA (22-notificaciones.md): instalable, necesaria para push en iPhone.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Almacenia",
    short_name: "Almacenia",
    description: "Comprá y vendé en los almacenes, kioscos y verdulerías de tu barrio.",
    start_url: "/",
    display: "standalone",
    background_color: "#fbf8f3",
    theme_color: "#0e6b5c",
    lang: "es-AR",
    icons: [
      { src: "/icons/icono-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icono-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icono-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
