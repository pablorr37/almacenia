import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import "./globals.css";
import { Providers } from "./providers";
import { CLASE_FUENTE } from "./fuentes";
import { resolverTema, variablesCss } from "@/lib/tema/tema";

// Tema por rubro (specs/sdd/21-temas.md): se lee de PERMIA_* en runtime, así la
// misma imagen Docker sirve a cada cliente con su estilo.
let advertido = false;

async function temaDeLaInstalacion() {
  await connection();
  const { tema, advertencia } = resolverTema(process.env);
  if (advertencia && !advertido) {
    advertido = true;
    console.warn(`[tema] ${advertencia}`);
  }
  return tema;
}

export async function generateMetadata(): Promise<Metadata> {
  const tema = await temaDeLaInstalacion();
  return { title: tema.marca, description: tema.descripcion };
}

export async function generateViewport(): Promise<Viewport> {
  const tema = await temaDeLaInstalacion();
  return { themeColor: tema.colores.primary };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const tema = await temaDeLaInstalacion();
  const fuentes = `${CLASE_FUENTE[tema.fuentes.display]} ${CLASE_FUENTE[tema.fuentes.sans]}`;
  return (
    <html lang="es" data-tema={tema.rubro} className={fuentes} style={variablesCss(tema) as React.CSSProperties}>
      <body>
        <Providers tema={tema}>{children}</Providers>
      </body>
    </html>
  );
}
