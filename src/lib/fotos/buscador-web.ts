// Buscador de fotos libres de derechos en la web (specs/sdd/16-banco-fotos.md).
// Es el mismo "algoritmo" para la app (curadores) y para el seed: palabras clave →
// consulta en inglés → Openverse (CC0 / dominio público) → filtrado y orden.
import { AppError } from "@/lib/errors";

export interface ResultadoWeb {
  origenUrl: string;
  imagenUrl: string;
  miniaturaUrl: string;
  ancho: number;
  alto: number;
  titulo: string | null;
  autor: string | null;
  licencia: "cc0" | "pdm";
}

const OPENVERSE_URL = "https://api.openverse.org/v1/images/";
const TIMEOUT_MS = 10_000;
const ANCHO_MINIMO = 600;
const MAX_RESULTADOS = 20;

const PALABRAS_VACIAS = new Set([
  "de", "del", "la", "el", "los", "las", "con", "sin", "y", "en", "para", "por", "x", "a", "al",
]);
// Medidas y envases: no describen qué hay en la foto.
const PALABRAS_MEDIDA = new Set([
  "kg", "g", "gr", "grs", "l", "lt", "lts", "ml", "cc", "unidad", "unidades", "u", "docena", "media", "pack",
]);

// Frases que se traducen juntas (se buscan antes que las palabras sueltas).
const FRASES: Array<[string, string]> = [
  ["aceite girasol", "sunflower oil"],
  ["yerba mate", "yerba mate"],
  ["pan frances", "french bread"],
  ["pan lactal", "sliced bread"],
  ["jamon cocido", "ham"],
  ["agua mineral", "water bottle"],
  ["papas fritas", "potato chips"],
  ["coca cola", "cola soda"],
  ["dulce leche", "dulce de leche"],
  ["torta manzana", "apple cake"],
];

// Diccionario es→en de productos y rubros comunes de almacén, verdulería y kiosco.
const PALABRAS: Record<string, string> = {
  tomate: "tomato", tomates: "tomato", papa: "potato", papas: "potato", cebolla: "onion",
  zanahoria: "carrot", lechuga: "lettuce", banana: "banana", manzana: "apple", naranja: "orange",
  limon: "lemon", mandarina: "tangerine", pera: "pear", uva: "grapes", uvas: "grapes", zapallo: "pumpkin",
  zapallito: "zucchini", pepino: "cucumber", morron: "bell pepper", ajo: "garlic", batata: "sweet potato",
  choclo: "corn", acelga: "chard", espinaca: "spinach", frutilla: "strawberry", durazno: "peach",
  palta: "avocado", sandia: "watermelon", melon: "melon", ciruela: "plum", kiwi: "kiwi",
  arroz: "rice", fideos: "pasta", fideo: "pasta", tallarin: "spaghetti", harina: "flour",
  azucar: "sugar", sal: "salt", aceite: "oil", vinagre: "vinegar", yerba: "yerba mate",
  cafe: "coffee", te: "tea", leche: "milk", yogur: "yogurt", manteca: "butter", huevos: "eggs",
  huevo: "eggs", queso: "cheese", jamon: "ham", salame: "salami", mortadela: "mortadella",
  fiambre: "cold cuts", fiambres: "cold cuts", pan: "bread", facturas: "pastries",
  medialunas: "croissants", medialuna: "croissant", galletitas: "cookies", galletas: "crackers",
  torta: "cake", bizcochos: "biscuits", alfajor: "alfajor", chocolate: "chocolate",
  caramelos: "candy", chicles: "chewing gum", chicle: "chewing gum", gaseosa: "soda",
  agua: "water", jugo: "juice", cerveza: "beer", vino: "wine", mermelada: "jam", miel: "honey",
  lentejas: "lentils", porotos: "beans", garbanzos: "chickpeas", atun: "tuna", pollo: "chicken",
  carne: "meat", detergente: "detergent", jabon: "soap", lavandina: "bleach", papel: "paper",
  almacen: "grocery store", verduleria: "greengrocer", kiosco: "kiosk", panaderia: "bakery",
  fiambreria: "delicatessen", hielo: "ice cubes", helado: "ice cream",
};

function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

// Pura: palabras significativas (minúsculas, sin tildes), sin vacías, medidas ni
// números ("1kg", "1.5L", "500ml"), sin repetidas y en el orden original.
export function palabrasClave(texto: string): string[] {
  const palabras = normalizar(texto)
    .split(/[^a-z0-9ñ.]+/)
    .map((p) => p.replace(/^\.+|\.+$/g, ""))
    .filter((p) => p.length > 0)
    .filter((p) => !/^\d/.test(p) && !PALABRAS_VACIAS.has(p) && !PALABRAS_MEDIDA.has(p));
  return [...new Set(palabras)];
}

// Pura: consulta en inglés. Primero frases, después palabra por palabra; las
// palabras sin traducción se descartan si alguna se tradujo ("tomate perita" →
// "tomato"). Si nada se tradujo, se busca el texto normalizado tal cual.
export function consultaWeb(texto: string): string {
  const palabras = palabrasClave(texto);
  if (palabras.length === 0) return "";

  const unidas = palabras.join(" ");
  for (const [frase, traduccion] of FRASES) {
    if (unidas.includes(frase)) return traduccion;
  }
  const traducidas = [...new Set(palabras.map((p) => PALABRAS[p]).filter((t): t is string => Boolean(t)))];
  return traducidas.length > 0 ? traducidas.join(" ") : unidas;
}

interface ResultadoOpenverse {
  foreign_landing_url?: string | null;
  url?: string | null;
  thumbnail?: string | null;
  width?: number | null;
  height?: number | null;
  title?: string | null;
  creator?: string | null;
  license?: string | null;
}

function proporcionCómoda(r: ResultadoWeb): boolean {
  const proporcion = r.ancho / r.alto;
  return proporcion >= 1 && proporcion <= 16 / 9;
}

// Pura: filtra (≥ 600 px, con URL, licencia cc0/pdm) y ordena (proporción
// apaisada o cuadrada primero, después por ancho). Máximo 20.
export function normalizarResultados(json: unknown): ResultadoWeb[] {
  const crudos = (json as { results?: unknown } | null)?.results;
  if (!Array.isArray(crudos)) return [];

  const resultados: ResultadoWeb[] = [];
  for (const crudo of crudos as ResultadoOpenverse[]) {
    const licencia = crudo.license;
    if (licencia !== "cc0" && licencia !== "pdm") continue;
    if (!crudo.url || !crudo.foreign_landing_url) continue;
    const ancho = Number(crudo.width ?? 0);
    const alto = Number(crudo.height ?? 0);
    if (ancho < ANCHO_MINIMO || alto <= 0) continue;
    resultados.push({
      origenUrl: crudo.foreign_landing_url,
      imagenUrl: crudo.url,
      miniaturaUrl: crudo.thumbnail || crudo.url,
      ancho,
      alto,
      titulo: crudo.title ?? null,
      autor: crudo.creator ?? null,
      licencia,
    });
  }

  return resultados
    .sort((a, b) => Number(proporcionCómoda(b)) - Number(proporcionCómoda(a)) || b.ancho - a.ancho)
    .slice(0, MAX_RESULTADOS);
}

function fuenteNoDisponible(): AppError {
  return new AppError(
    "FUENTE_EXTERNA_NO_DISPONIBLE",
    "No se pudo consultar el buscador de fotos libres. Probá de nuevo en un rato."
  );
}

export async function buscarWeb(
  texto: string,
  opciones: { fetch?: typeof fetch } = {}
): Promise<ResultadoWeb[]> {
  const q = consultaWeb(texto);
  if (!q) return [];

  const url = new URL(OPENVERSE_URL);
  url.searchParams.set("q", q);
  url.searchParams.set("license", "cc0,pdm");
  url.searchParams.set("extension", "jpg,png");
  url.searchParams.set("page_size", "40");

  const hacerFetch = opciones.fetch ?? fetch;
  let respuesta: Response;
  try {
    respuesta = await hacerFetch(url.toString(), {
      headers: { Accept: "application/json", "User-Agent": "Almacenia/1.0 (banco de fotos)" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw fuenteNoDisponible();
  }
  if (!respuesta.ok) throw fuenteNoDisponible();

  const json = await respuesta.json().catch(() => {
    throw fuenteNoDisponible();
  });
  return normalizarResultados(json);
}
