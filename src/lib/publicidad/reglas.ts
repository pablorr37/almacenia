// Reglas puras del motor de avisos (21-publicidad.md). Sin dependencias de servidor:
// las usa también la UI.

export type EspacioAviso = "inicio" | "lista" | "comparar" | "tienda_pie" | "pin_mapa" | "push";

export const ESPACIOS: readonly EspacioAviso[] = ["inicio", "lista", "comparar", "tienda_pie", "pin_mapa", "push"];
// Espacios que se muestran con <EspacioPublicitario> y pasan por el rotador.
export const ESPACIOS_BANNER: readonly EspacioAviso[] = ["inicio", "lista", "comparar", "tienda_pie"];

export const ETIQUETA_ESPACIO: Record<EspacioAviso, string> = {
  inicio: "Menú de inicio",
  lista: "Lista de negocios cercanos",
  comparar: "Buscar y comparar",
  tienda_pie: "Pie de página de tiendas",
  pin_mapa: "Tienda destacada en el mapa",
  push: "Notificación push",
};

export const MEDIDAS_SUGERIDAS: Record<EspacioAviso, string | null> = {
  inicio: "320×100 o 320×50",
  lista: "320×100 o 320×50",
  comparar: "300×250",
  tienda_pie: "320×100 o 320×50",
  pin_mapa: null,
  push: null,
};

export const TEXTO_MAXIMO = 140;
export const DIAS_MAXIMO = 90;

const PROPORCIONES: Partial<Record<EspacioAviso, [number, number]>> = {
  inicio: [2.5, 7],
  lista: [2.5, 7],
  tienda_pie: [2.5, 7],
  comparar: [1, 1.5],
};

export function aceptaImagen(espacio: EspacioAviso): boolean {
  return PROPORCIONES[espacio] !== undefined;
}

export function proporcionValida(espacio: EspacioAviso, ancho: number, alto: number): boolean {
  const rango = PROPORCIONES[espacio];
  if (!rango || ancho <= 0 || alto <= 0) return false;
  const p = ancho / alto;
  return p >= rango[0] && p <= rango[1];
}

// Vacío (= página de la tienda), ruta interna (/…, no //…) o https://host/…
export function destinoValido(destino: string | null | undefined): boolean {
  if (destino === null || destino === undefined || destino === "") return true;
  if (destino.startsWith("/")) return !destino.startsWith("//") && !destino.startsWith("/\\");
  try {
    const url = new URL(destino);
    return url.protocol === "https:" && url.hostname.length > 0;
  } catch {
    return false;
  }
}

export function elegirPonderado<T extends { peso: number }>(items: T[], azar: () => number = Math.random): T | null {
  const total = items.reduce((s, i) => s + Math.max(0, i.peso), 0);
  if (items.length === 0 || total <= 0) return null;
  let r = azar() * total;
  for (const item of items) {
    r -= Math.max(0, item.peso);
    if (r < 0) return item;
  }
  return items[items.length - 1];
}

export function diasNoUsados(c: { dias: number; diasConsumidos: number }): number {
  return Math.max(0, c.dias - c.diasConsumidos);
}
