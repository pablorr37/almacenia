// Fuentes de todos los temas (specs/sdd/21-temas.md). next/font exige declararlas a
// nivel de módulo; el layout aplica solo las dos `variable` del tema activo, así el
// navegador descarga únicamente esas. preload solo en las del tema por defecto.
import {
  Bricolage_Grotesque,
  Cormorant_Garamond,
  Jost,
  Manrope,
  Nunito_Sans,
  Outfit,
  Plus_Jakarta_Sans,
  Unbounded,
} from "next/font/google";
import type { FuenteTema } from "@/lib/tema/tema";

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin", "latin-ext"],
  axes: ["opsz", "wdth"],
  display: "swap",
});
const plusJakarta = Plus_Jakarta_Sans({ variable: "--font-plus-jakarta", subsets: ["latin", "latin-ext"], display: "swap" });
const unbounded = Unbounded({ variable: "--font-unbounded", subsets: ["latin", "latin-ext"], display: "swap", preload: false });
const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin", "latin-ext"], display: "swap", preload: false });
const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin", "latin-ext"],
  weight: ["500", "600", "700"],
  display: "swap",
  preload: false,
});
const jost = Jost({ variable: "--font-jost", subsets: ["latin", "latin-ext"], display: "swap", preload: false });
const outfit = Outfit({ variable: "--font-outfit", subsets: ["latin", "latin-ext"], display: "swap", preload: false });
const nunitoSans = Nunito_Sans({ variable: "--font-nunito-sans", subsets: ["latin", "latin-ext"], display: "swap", preload: false });

export const CLASE_FUENTE: Record<FuenteTema, string> = {
  bricolage: bricolage.variable,
  "plus-jakarta": plusJakarta.variable,
  unbounded: unbounded.variable,
  manrope: manrope.variable,
  cormorant: cormorant.variable,
  jost: jost.variable,
  outfit: outfit.variable,
  "nunito-sans": nunitoSans.variable,
};
