# Módulo: tema por rubro (estilo de la tienda)

Convenciones comunes: ver [`00-overview.md`](00-overview.md).

Permia es un clon de Almacenia que se vende **una instalación por cliente**, cada una
en su propio VPS. Todas las instalaciones salen de la **misma imagen Docker**. El
rubro del negocio del cliente (distribuidora de bebidas, vinoteca, vivero, almacén…)
define el **tema**: paleta, tipografía, radios, sombras, ícono de marca y textos de
portada. Cambiar el rubro cambia todo el frontend sin tocar el código.

## Configuración (por instalación)

Variables de entorno del contenedor. Se leen **en tiempo de ejecución**, no en el
build: la misma imagen sirve a todos los clientes.

| Variable | Obligatoria | Qué hace |
| --- | --- | --- |
| `PERMIA_RUBRO` | no | Uno de los rubros de la tabla de abajo. Si falta, `almacen`. |
| `PERMIA_NOMBRE` | no | Nombre comercial que se muestra (marca). Si falta, el del tema. |
| `PERMIA_ESLOGAN` | no | Título de la portada. Si falta, el del tema. |
| `PERMIA_DESCRIPCION` | no | Bajada de la portada y `<meta description>`. Si falta, la del tema. |

Reglas:
- Los valores se recortan (`trim`). Un valor vacío cuenta como ausente.
- `PERMIA_RUBRO` no distingue mayúsculas ni tildes (`Vivero`, `VIVERO` → `vivero`).
- Un `PERMIA_RUBRO` desconocido **no rompe** el sitio: se usa `almacen` y se
  registra una advertencia en el log del servidor (`console.warn`) nombrando el valor
  recibido y los válidos.
- No es configuración del admin (no vive en la DB): el tema se fija al instalar el
  VPS. Un selector en el panel admin queda para otra ronda.

## Rubros y temas

| Rubro | Carácter | Primario | Acento | Tipografía (títulos + texto) | Radios (control / tarjeta) | Ícono |
| --- | --- | --- | --- | --- | --- | --- |
| `almacen` | cálido, de barrio (el de Almacenia) | verde petróleo `#0e6b5c` | naranja `#c2561f` (*) | Bricolage Grotesque + Plus Jakarta Sans | 12 / 16 px | tienda |
| `bebidas` | moderno y joven | violeta eléctrico `#6d28d9` | fucsia `#d0145f` | Unbounded + Manrope | 16 / 24 px | botella |
| `vinos` | sobrio y elegante | bordó `#6b1f2e` | oro viejo `#8a6420` | Cormorant Garamond + Jost | 4 / 6 px | copa |
| `vivero` | vibrante y verde | verde hoja `#15803d` | terracota `#c2410c` | Outfit + Nunito Sans | 14 / 20 px | planta |

(*) Almacenia usaba `#e2723a`, que con texto blanco da 3,1:1; se oscureció al mínimo
que cumple el contraste de abajo.

Cada tema define también: `primaryDark`, `primarySoft`, `accentDark`, `accentText`,
`text`, `text2`, `bg`, `surface`, `border`, `placeholder`, la marca por defecto, el
eslogan y la descripción de la portada. La fuente de verdad es
`src/lib/tema/tema.ts`.

### Accesibilidad (invariante de todo tema)

Contraste WCAG 2.x, mínimo **4,5:1** en:
- texto blanco sobre `primary`, `primaryDark`, `accent` y `accentDark` (botones);
- `text`, `text2` y `accentText` sobre `bg` y sobre `surface`;
- `primaryDark` sobre `bg` (la marca en las cabeceras).

Los tests lo verifican para cada tema; agregar un tema que no lo cumpla hace fallar
`npm test`.

## Cómo se aplica

- `src/app/layout.tsx` llama `await connection()` (rendering dinámico, así la variable
  se lee en runtime) y resuelve el tema.
- Las variables CSS del tema (`--color-*`, `--font-display`, `--font-sans`,
  `--radius-*`, `--shadow-cta`, `--shadow-cta-accent`) van como `style` inline en
  `<html>`. Pisan los valores por defecto de `@theme` en `globals.css`; las utilidades
  de Tailwind (`bg-primary`, `rounded-card`…) ya las referencian, así que los
  componentes no cambian.
- `<html data-tema="<rubro>">` queda disponible para ajustes de CSS que no son
  variables (ej. el tracking de los títulos con serif).
- Solo se aplican las clases `variable` de next/font de las dos fuentes del tema.
- `<meta name="theme-color">` = `primary` del tema; `<title>` = marca;
  `<meta description>` = descripción.
- Los componentes cliente leen marca, textos, ícono y colores con `useTema()`
  (contexto que provee `src/app/providers.tsx`). Lo usan las cabeceras, la portada,
  los textos que nombran la marca y lo que no puede usar variables CSS (colores de
  Leaflet, color del QR).
- **Prohibido** escribir colores hex de marca en los componentes: se usan las
  utilidades del tema (`accent-primary`, `stroke-text`…) o `useTema().colores`.

## Firmas TypeScript (`src/lib/tema/`)

```ts
export const RUBROS_TEMA = ["almacen", "bebidas", "vinos", "vivero"] as const;
export type RubroTema = (typeof RUBROS_TEMA)[number];

export type FuenteTema =
  | "bricolage" | "plus-jakarta" | "unbounded" | "manrope"
  | "cormorant" | "jost" | "outfit" | "nunito-sans";

export type IconoMarca = "tienda" | "botella" | "copa" | "planta";

export interface ColoresTema {
  primary: string; primaryDark: string; primarySoft: string;
  accent: string; accentDark: string; accentText: string;
  text: string; text2: string; bg: string; surface: string;
  border: string; placeholder: string;
}

export interface Tema {
  rubro: RubroTema;
  marca: string;
  eslogan: string;
  descripcion: string;
  icono: IconoMarca;
  colores: ColoresTema;
  fuentes: { display: FuenteTema; sans: FuenteTema };
  radios: { control: number; card: number }; // px
}

export const TEMAS: Record<RubroTema, Tema>;

/** Normaliza (trim, minúsculas, sin tildes) y valida. null si no es un rubro conocido. */
export function parsearRubro(valor: string | undefined): RubroTema | null;

/**
 * Tema efectivo de la instalación según las variables PERMIA_*.
 * Rubro desconocido → tema `almacen` y `advertencia` con el detalle.
 */
export function resolverTema(env: Record<string, string | undefined>): {
  tema: Tema;
  advertencia: string | null;
};

/** Variables CSS para el style de <html>. */
export function variablesCss(tema: Tema): Record<`--${string}`, string>;

/** Razón de contraste WCAG entre dos colores #rrggbb (1 a 21). */
export function contraste(a: string, b: string): number;
```

## Casos a contemplar

- Sin variables → tema `almacen` con la marca "Permia".
- `PERMIA_RUBRO=" Bebidas "` → `bebidas`.
- `PERMIA_RUBRO=vivéro` → `vivero` (sin tildes).
- `PERMIA_RUBRO=ferreteria` → `almacen` + advertencia.
- `PERMIA_NOMBRE="Distribuidora Don Pepe"` pisa la marca del tema; los colores no
  cambian.
- `variablesCss` incluye cada color con el nombre de token de `globals.css`
  (`primaryDark` → `--color-primary-dark`, `text2` → `--color-text-2`), las fuentes
  como `var(--font-<fuente>), system-ui, sans-serif` (serif para `cormorant`), y los
  radios en px.

## Fuera de alcance (otras rondas)

- Selector de tema desde el panel admin (sin redeploy).
- Logo propio del cliente subido a S3 (hoy: ícono del rubro + nombre).
- Datos de demo (seed) por rubro: tiendas, rubros y categorías de bebidas, vinos o
  plantas. Hoy el seed sigue siendo el de almacenes de San Juan.
- Región configurable (el radio de alcance y la vitrina siguen centrados en San Juan).
- Modo oscuro.
