// Filtro de groserías para textos que cargan los usuarios y ven otros (nombres de
// productos de catálogo, listas, tiendas). Pura: sin DB ni red. Compara por palabra
// completa (o raíz para las que tienen muchas variantes) para no bloquear palabras
// legítimas que contienen esas letras ("Disputa", "Pijama", "Concha y Toro").
import { AppError } from "@/lib/errors";

// Palabras que se bloquean solo si aparecen completas.
const PALABRAS = new Set([
  "puto", "puta", "putos", "putas", "puton", "putona", "putita", "putito",
  "pija", "pijas", "verga", "vergas", "choto", "chota", "chotos", "culo", "culos", "orto",
  "pete", "petes", "petero", "petera", "trolo", "trola", "trolos", "cagon", "cagona",
  "garcha", "garca", "garcas", "carajo", "hdp", "hdmp", "ctm",
  "fuck", "fucking", "shit", "bitch", "asshole", "dick", "cunt",
]);

// Raíces: bloquean cualquier palabra que empiece así (boludo, boludas, pelotudez...).
const RAICES = ["bolud", "pelotud", "conchud", "culiad", "pajer", "maricon", "sorete", "mierd", "porong", "cornud", "pelotu"];

// Frases (sobre el texto normalizado con espacios simples).
const FRASES = ["concha de tu", "concha tu", "concha de su", "concha su", "concha de la lora", "hijo de puta", "hija de puta"];

const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", $: "s" };

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[013457@$]/g, (c) => LEET[c] ?? c)
    .replace(/[^a-zñ]+/g, " ")
    .trim();
}

// "puuuto" → "puto". Solo para comparar: no afecta palabras normales de la lista.
function colapsar(palabra: string): string {
  return palabra.replace(/(.)\1+/g, "$1");
}

// "p u t o" → "puto": une letras sueltas consecutivas (evasión con separadores).
function unirLetrasSueltas(tokens: string[]): string[] {
  const resultado: string[] = [];
  let buffer = "";
  for (const t of tokens) {
    if (t.length === 1) {
      buffer += t;
      continue;
    }
    if (buffer) resultado.push(buffer);
    buffer = "";
    resultado.push(t);
  }
  if (buffer) resultado.push(buffer);
  return resultado;
}

const PALABRAS_COLAPSADAS = new Set([...PALABRAS].map(colapsar));

export function contieneGroseria(texto: string): boolean {
  const normal = normalizar(texto);
  if (!normal) return false;
  const conEspacios = ` ${normal} `;
  if (FRASES.some((f) => conEspacios.includes(` ${f} `))) return true;

  const tokens = unirLetrasSueltas(normal.split(/\s+/));
  return tokens.some((t) => {
    const c = colapsar(t);
    return PALABRAS.has(t) || PALABRAS_COLAPSADAS.has(c) || RAICES.some((r) => t.startsWith(r) || c.startsWith(colapsar(r)));
  });
}

export function exigirTextoPermitido(texto: string, campo: string): void {
  if (contieneGroseria(texto)) {
    throw new AppError("TEXTO_NO_PERMITIDO", `${campo} tiene palabras no permitidas. Probá con otro.`);
  }
}
