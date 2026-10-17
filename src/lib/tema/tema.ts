// Tema por rubro de la instalación (specs/sdd/21-temas.md). Cada VPS de Permia
// elige su rubro con PERMIA_RUBRO y eso define paleta, tipografía, radios, ícono y
// textos de portada. Módulo puro: lo usan el layout (server) y useTema() (cliente).

export const RUBROS_TEMA = ["almacen", "bebidas", "vinos", "vivero"] as const;
export type RubroTema = (typeof RUBROS_TEMA)[number];

export type FuenteTema =
  | "bricolage"
  | "plus-jakarta"
  | "unbounded"
  | "manrope"
  | "cormorant"
  | "jost"
  | "outfit"
  | "nunito-sans";

export type IconoMarca = "tienda" | "botella" | "copa" | "planta";

export interface ColoresTema {
  primary: string;
  primaryDark: string;
  primarySoft: string;
  accent: string;
  accentDark: string;
  accentText: string;
  text: string;
  text2: string;
  bg: string;
  surface: string;
  border: string;
  placeholder: string;
}

export interface Tema {
  rubro: RubroTema;
  marca: string;
  eslogan: string;
  descripcion: string;
  icono: IconoMarca;
  colores: ColoresTema;
  fuentes: { display: FuenteTema; sans: FuenteTema };
  radios: { control: number; card: number };
}

export const TEMAS: Record<RubroTema, Tema> = {
  // El de Almacenia, sin cambios (ver docs/auditoria-ui-ux.md).
  almacen: {
    rubro: "almacen",
    marca: "Permia",
    eslogan: "Lo del barrio, a una cuadra.",
    descripcion: "Encontrá almacenes, kioscos y verdulerías cerca tuyo, compará precios y armá tu recorrido de compras.",
    icono: "tienda",
    colores: {
      primary: "#0e6b5c",
      primaryDark: "#094f44",
      primarySoft: "#d8f3ea",
      // #e2723a de Almacenia daba 3,1:1 con texto blanco; se oscurece al mínimo que cumple 4,5:1.
      accent: "#c2561f",
      accentDark: "#9a4219",
      accentText: "#b85423",
      text: "#201a15",
      text2: "#6b6058",
      bg: "#fbf8f3",
      surface: "#ffffff",
      border: "#e7e0d5",
      placeholder: "#f0eae0",
    },
    fuentes: { display: "bricolage", sans: "plus-jakarta" },
    radios: { control: 12, card: 16 },
  },
  // Moderno y joven: violeta eléctrico + fucsia, geométrica ancha, bordes muy redondos.
  bebidas: {
    rubro: "bebidas",
    marca: "Permia Bebidas",
    eslogan: "Bien frías, en tu puerta.",
    descripcion: "Gaseosas, aguas, cervezas, energizantes y más. Pedí por bulto o por unidad y retirá o recibí tu pedido.",
    icono: "botella",
    colores: {
      primary: "#6d28d9",
      primaryDark: "#4c1d95",
      primarySoft: "#ede4ff",
      accent: "#d0145f",
      accentDark: "#a3104a",
      accentText: "#a3104a",
      text: "#14111f",
      text2: "#5d5873",
      bg: "#f7f5ff",
      surface: "#ffffff",
      border: "#e4e0f2",
      placeholder: "#eeeaf9",
    },
    fuentes: { display: "unbounded", sans: "manrope" },
    radios: { control: 16, card: 24 },
  },
  // Sobrio y elegante: bordó + oro viejo sobre marfil, serif clásica, esquinas casi rectas.
  vinos: {
    rubro: "vinos",
    marca: "Permia Vinos",
    eslogan: "Una copa a la altura de la ocasión.",
    descripcion: "Vinos, espumantes y destilados seleccionados. Descubrí cada etiqueta y reservá la tuya.",
    icono: "copa",
    colores: {
      primary: "#6b1f2e",
      primaryDark: "#4a1420",
      primarySoft: "#f3e7e4",
      accent: "#8a6420",
      accentDark: "#6e4f17",
      accentText: "#7a5819",
      text: "#1f1a17",
      text2: "#6a5f58",
      bg: "#faf7f2",
      surface: "#fffdf9",
      border: "#e6ddd2",
      placeholder: "#f1ebe2",
    },
    fuentes: { display: "cormorant", sans: "jost" },
    radios: { control: 4, card: 6 },
  },
  // Vibrante y verde: verde hoja + terracota de maceta, redondeada y amable.
  vivero: {
    rubro: "vivero",
    marca: "Permia Vivero",
    eslogan: "Llená tu casa de verde.",
    descripcion: "Plantas de interior y exterior, macetas, sustratos y todo para tu jardín, cerca tuyo.",
    icono: "planta",
    colores: {
      primary: "#15803d",
      primaryDark: "#166534",
      primarySoft: "#dcfce7",
      accent: "#c2410c",
      accentDark: "#9a3412",
      accentText: "#9a3412",
      text: "#12210f",
      text2: "#4d6148",
      bg: "#f4fbf2",
      surface: "#ffffff",
      border: "#d5ead3",
      placeholder: "#e6f3e2",
    },
    fuentes: { display: "outfit", sans: "nunito-sans" },
    radios: { control: 14, card: 20 },
  },
};

const FUENTES_SERIF: ReadonlySet<FuenteTema> = new Set(["cormorant"]);

function normalizar(valor: string): string {
  return valor
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function textoOVacio(valor: string | undefined): string | null {
  const t = valor?.trim();
  return t ? t : null;
}

export function parsearRubro(valor: string | undefined): RubroTema | null {
  if (valor === undefined) return null;
  const n = normalizar(valor);
  return (RUBROS_TEMA as readonly string[]).includes(n) ? (n as RubroTema) : null;
}

export function resolverTema(env: Record<string, string | undefined>): { tema: Tema; advertencia: string | null } {
  const crudo = textoOVacio(env.PERMIA_RUBRO);
  const rubro = parsearRubro(crudo ?? undefined);
  const advertencia =
    crudo && !rubro
      ? `PERMIA_RUBRO="${crudo}" no es un rubro conocido; se usa "almacen". Válidos: ${RUBROS_TEMA.join(", ")}.`
      : null;
  const base = TEMAS[rubro ?? "almacen"];
  return {
    tema: {
      ...base,
      marca: textoOVacio(env.PERMIA_NOMBRE) ?? base.marca,
      eslogan: textoOVacio(env.PERMIA_ESLOGAN) ?? base.eslogan,
      descripcion: textoOVacio(env.PERMIA_DESCRIPCION) ?? base.descripcion,
    },
    advertencia,
  };
}

function rgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

function pilaFuente(fuente: FuenteTema): string {
  return FUENTES_SERIF.has(fuente)
    ? `var(--font-${fuente}), Georgia, serif`
    : `var(--font-${fuente}), system-ui, sans-serif`;
}

// Nombre de token de globals.css para cada clave de ColoresTema.
const TOKEN_COLOR: Record<keyof ColoresTema, string> = {
  primary: "--color-primary",
  primaryDark: "--color-primary-dark",
  primarySoft: "--color-primary-soft",
  accent: "--color-accent",
  accentDark: "--color-accent-dark",
  accentText: "--color-accent-text",
  text: "--color-text",
  text2: "--color-text-2",
  bg: "--color-bg",
  surface: "--color-surface",
  border: "--color-border",
  placeholder: "--color-placeholder",
};

export function variablesCss(tema: Tema): Record<`--${string}`, string> {
  const v: Record<`--${string}`, string> = {};
  for (const [clave, token] of Object.entries(TOKEN_COLOR) as [keyof ColoresTema, `--${string}`][]) {
    v[token] = tema.colores[clave];
  }
  v["--font-display"] = pilaFuente(tema.fuentes.display);
  v["--font-sans"] = pilaFuente(tema.fuentes.sans);
  v["--radius-control"] = `${tema.radios.control}px`;
  v["--radius-card"] = `${tema.radios.card}px`;
  v["--shadow-cta"] = `0 4px 12px rgb(${rgb(tema.colores.primary).join(" ")} / 0.25)`;
  v["--shadow-cta-accent"] = `0 4px 12px rgb(${rgb(tema.colores.accent).join(" ")} / 0.25)`;
  return v;
}

function luminancia(hex: string): number {
  const [r, g, b] = rgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contraste(a: string, b: string): number {
  const [l1, l2] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}
