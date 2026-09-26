# Auditoría UI/UX — Almacenia (mobile-first)

> Fecha: 2026-09-26 · Alcance: `globals.css`, `layout.tsx`, home (invitado + mapa), `TiendaMap`, `BottomSheet`,
> `Button`/`Card`/`Input`, tienda (`/tiendas/[id]`), perfil, mis pedidos, detalle de pedido, `/mi-tienda`, login y registro.
> Referencia de marca: manual "Almacenia — Design" (teal `#0E6B5C` / terracota `#E2723A`, fondo `#FBF8F3`).
>
> Guías citadas (abreviaturas): **M3** = Material Design 3 (Motion: easing & duration tokens, transition patterns) ·
> **HIG** = Apple Human Interface Guidelines (Motion, Typography, Layout/hit targets 44×44 pt) ·
> **NN/g #n** = heurística n de Nielsen · **WCAG x.y.z** = WCAG 2.2 · **Baymard** = Baymard Institute (mobile e-commerce, checkout, filtros) ·
> **Patrones** = Google Maps place card, Rappi, PedidosYa, Uber Eats, Airbnb map pins.

---

## 1. Resumen ejecutivo

La base visual es buena y coherente: paleta cálida bien tokenizada en `@theme`, radios consistentes (12/16/999), una
spring táctil ya definida (`--ease-tactile`) y un layout `max-w-md` pensado para móvil. Los problemas no son de
"estética" sino de **confianza, accesibilidad y feedback**:

1. **Información que falta donde se decide** (P0): el detalle de pedido muestra "1× producto" sin nombre ni tienda;
   "Mis pedidos" lista solo estado + total; el total del carrito se calcula sobre los productos *filtrados*, así que
   cambia (baja) al filtrar el catálogo. Rompe NN/g #1 y #6 y la confianza del checkout (Baymard).
2. **Accesibilidad** (P0/P1): el terracota como texto (`text-accent` sobre `#FBF8F3`) da **2,96:1** y el botón accent
   con texto blanco **3,13:1** (falla WCAG 1.4.3 para texto <18,66 px bold); los bordes de inputs (`#E7E0D5`, 1,31:1)
   fallan WCAG 1.4.11; no hay `:focus-visible` en botones/links; varios targets de 28–32 px (HIG 44 pt, WCAG 2.5.8);
   no existe `prefers-reduced-motion` (WCAG 2.3.3).
3. **El mapa no se siente "de la marca"**: pines azules por defecto de Leaflet cargados desde unpkg, popup blanco
   genérico, `onSelect={() => {}}` (tocar un pin no hace nada en la lista/sheet). Los patrones de referencia (Google
   Maps, Airbnb, PedidosYa) usan pin propio + *place card* anclada abajo.
4. **Movimiento sin sistema**: sólo existe una curva; se aplica `scale(.96)` a *todo* `a`/`button` (incluidos links de
   texto y cards grandes) y el bottom sheet anima `height` con spring con overshoot (jank + rebote en layout).
5. **Tipografía**: Fraunces en 17–22 px bold se lee "editorial/gourmet" más que "barrio", y se carga sin sus ejes
   ópticos. Recomendación final: **`Bricolage_Grotesque` (display) + `Plus_Jakarta_Sans` (UI)** (ver §3).

Quick wins (≤1 día): tokens de movimiento + reduced-motion, `--color-accent-text`, `focus-visible`, targets 44 px,
arreglar total del carrito, nombre de producto/tienda en pedidos, `overflow-x: clip` en `html/body`.

---

## 2. Hallazgos priorizados por pantalla

Prioridad: **P0** = bloquea confianza/tarea o incumple AA; **P1** = fricción alta o inconsistencia de sistema;
**P2** = pulido.

### 2.0 Global (`globals.css`, componentes base)

| # | P | Problema | Guía | Recomendación |
|---|---|---|---|---|
| G1 | P0 | `text-accent` (#E2723A) como texto de links ("Creá una", "Volver al mapa", "publicá tu tienda") = 2,96:1 sobre `bg`. | WCAG 1.4.3 (4.5:1) | Agregar `--color-accent-text: #B85423` (4,58:1) y usar `text-accent-text` en todo link de texto. Reservar `accent` para fondos/íconos. |
| G2 | P0 | `Button variant="accent"`: blanco sobre #E2723A = 3,13:1 con 15 px semibold. | WCAG 1.4.3 | Fondo `bg-accent-dark` (#B85423, 4,85:1) en reposo, o texto `text-[18px] font-bold` sólo si es CTA grande. Preferible: accent sólo para chips/badges/pines, CTA siempre `primary`. |
| G3 | P0 | Sin `prefers-reduced-motion`: `scale(.96)` + spring del sheet se ejecutan siempre. | WCAG 2.3.3; HIG Motion ("Reduce Motion") | Bloque `@media (prefers-reduced-motion: reduce)` de §4.5. |
| G4 | P0 | No hay foco visible en `button`/`a` (sólo inputs con `focus:shadow`). | WCAG 2.4.7 / 2.4.11 (Focus Not Obscured); NN/g #1 | En base: `:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; border-radius: inherit }`. |
| G5 | P1 | Bordes de controles `#E7E0D5` (1,31:1 vs blanco): el input "desaparece" al sol. | WCAG 1.4.11 (3:1 para límites de componentes) | Nuevo `--color-border-control: #8C8178` (3,8:1) para `Input`, `select`, stepper; mantener `border` suave para cards. |
| G6 | P1 | `button:active, a:active { scale(.96) }` global: afecta links de texto, cards de 100% ancho (se nota "chicle") y tabs. | M3 Motion (escala proporcional al tamaño del componente); HIG (feedback sutil) | Sacar la regla global; crear utilidades `.press` (scale .96, botones/íconos) y `.press-soft` (scale .985, cards/filas). |
| G7 | P1 | `html, body { overflow-x: hidden }` convierte a `body` en contenedor de scroll → `position: sticky` (CTA "Confirmar pedido", barra de HomeInvitado) puede dejar de pegarse. | — (bug de CSS) | Usar `overflow-x: clip` (no crea scroll container). Verificar en iOS Safari. |
| G8 | P1 | Estados de carga = texto "Cargando..." suelto. | NN/g #1 (visibilidad del estado); M3 (Progress indicators) | Skeletons con `bg-placeholder` + shimmer de 1,2 s (desactivado en reduced-motion) con la forma real de la card. |
| G9 | P1 | Errores en `text-[13px] text-estado-rechazado-text` sin ícono ni `role="alert"`. | WCAG 4.1.3 (Status Messages); NN/g #9 | Componente `<Aviso tipo="error">` con ícono, `role="alert"`, texto que diga qué hacer ("Revisá tu conexión y probá de nuevo"). |
| G10 | P2 | Sombras escritas a mano (`shadow-[0_1px_3px_rgba(32,26,21,0.05)]`) repetidas en 10+ lugares. | M3 (elevation tokens) | `@theme { --shadow-card: 0 1px 3px rgb(32 26 21 / .05); --shadow-float: 0 1px 3px rgb(32 26 21 / .1); --shadow-cta: 0 4px 12px rgb(14 107 92 / .25); --shadow-sheet: 0 -4px 20px rgb(32 26 21 / .12) }` → `shadow-card`, etc. |
| G11 | P2 | Tamaños `text-[13px]`, `[15px]`, `[17px]`… arbitrarios. | HIG Typography (escala dinámica); M3 type scale | Escala en `@theme`: `--text-caption: 12px`, `--text-label: 13px`, `--text-body: 15px`, `--text-title: 17px`, `--text-headline: 22px`, `--text-display: 28px` (con `--line-height` asociados). |

### 2.1 Home invitado (`HomeInvitado.tsx`)

| # | P | Problema | Guía | Recomendación |
|---|---|---|---|---|
| H1 | P1 | Wordmark "Almacenia" + H1 "Bienvenido a Almacenia": marca repetida, H1 sin propuesta de valor. | NN/g #8 (minimalista); Baymard (value proposition above the fold) | H1: "Lo del barrio, a una cuadra" / "Tu almacén de siempre, ahora en el celu". Wordmark sólo arriba (18 px). |
| H2 | P1 | Las cards de tiendas parecen tocables (card con sombra) pero son `div` sin acción → affordance falsa. | NN/g #4 (consistencia); HIG (controls look interactive only if they are) | Hacerlas `Link` a `/login?next=/tiendas/{id}` o quitar sombra y poner candado/"Iniciá sesión para ver". Preferido: tocables. |
| H3 | P1 | Avatar vacío `bg-primary-soft` sin ícono ni distancia (se calcula pero no se muestra). | Patrones (Rappi/PedidosYa: logo + distancia + estado) | Ícono del tipo de tienda en el círculo y "a 350 m · Abierto" en `text-label text-text-2`. |
| H4 | P2 | CTA de 55 caracteres en 2 líneas. | Baymard (CTA cortos y específicos); HIG (labels concisos) | "Ver tiendas cerca mío" + subtexto "Necesitás una cuenta gratis". |
| H5 | P2 | Sin coreografía de entrada; el contenido aparece en seco al terminar el fetch. | M3 Transitions (enter & exit); NN/g #1 | §5. |

### 2.2 Mapa autenticado (`page.tsx`, `TiendaMap`, `BottomSheet`)

| # | P | Problema | Guía | Recomendación |
|---|---|---|---|---|
| M1 | P0 | `onSelect={() => {}}`: tocar un pin no selecciona nada; el popup Leaflet es el único feedback. | NN/g #1; Patrones (Google Maps: pin ↔ place card sincronizados) | Estado `seleccionadaId`; pin → place card (§6) + scroll de la lista al ítem; ítem de lista → `map.flyTo` + pin seleccionado. |
| M2 | P1 | Pines azules por defecto, descargados de `unpkg.com` (dependencia externa, fuera de marca). | HIG (consistencia de marca); Patrones (Airbnb/PedidosYa pin propio) | `L.divIcon` con SVG inline (§6.1). Elimina la llamada a unpkg. |
| M3 | P1 | Lista del sheet numerada 1,2,3 pero los pines no tienen número → el número no significa nada. | NN/g #2 (match con el mundo real); NN/g #4 | Reemplazar número por ícono de tipo + estado Abierto/Cerrado; si se quiere numerar, numerar también el pin. |
| M4 | P1 | Sheet anima `height` con spring con overshoot (0.34,1.56…): reflow por frame y "rebote" que tapa/destapa el mapa. | M3 Motion (sheets: emphasized decelerate, sin overshoot en superficies grandes); HIG (motion "physically plausible") | Altura fija 90dvh y animar `transform: translateY()`; `transition: transform var(--dur-slow) var(--ease-emphasized-decelerate)`. Spring sólo en elementos pequeños. |
| M5 | P1 | Sheet sin teclado/lectores: el handle no es botón; alturas en `vh` (salta con la barra de Safari). | WCAG 2.1.1 / 2.5.7 (Dragging Movements: alternativa sin arrastre); HIG | Handle como `<button aria-label="Expandir lista">` que cicla snaps con tap; usar `dvh`. |
| M6 | P1 | "3 tienda(s) cerca tuyo" y 👤 emoji como avatar. | NN/g #2; HIG (iconografía consistente) | Pluralizar ("3 tiendas cerca"); ícono SVG de persona o avatar real (`session.user.image`) 40×40. |
| M7 | P1 | Pedir geolocalización al montar, sin pre-permiso; si se niega, pantalla muerta. | Baymard (explicar antes de pedir permisos); NN/g #9 | Pantalla/tarjeta previa "Usamos tu ubicación para mostrarte tiendas a pie" + fallback: buscar por barrio/dirección. |
| M8 | P2 | Links "Mi tienda" y perfil de 30–36 px de alto. | HIG 44×44 pt; WCAG 2.5.8 (24 px mínimo AA) | `h-11 min-w-11` (44 px). |
| M9 | P2 | `borderRadius: 20px` en el `MapContainer` a pantalla completa: esquinas redondeadas visibles contra `bg`. | — | Radio 0 en full-bleed. |

### 2.3 Tienda (`/tiendas/[id]`)

| # | P | Problema | Guía | Recomendación |
|---|---|---|---|---|
| T1 | P0 | `total` se calcula con `productos` (lista filtrada): al buscar/filtrar, el total del botón baja y los ítems ocultos "desaparecen" del pedido. | NN/g #1 y #5 (prevención de errores); Baymard (cart consistency) | Guardar en el carrito `{precio, nombre}` al agregar y totalizar sobre el carrito, no sobre el catálogo visible. |
| T2 | P0 | "Confirmar pedido" crea el pedido en un toque, sin resumen (ítems, retiro, medio de pago). | Baymard (order review step); NN/g #3 y #5 | Botón → sheet "Tu pedido" (lista editable, total, medio de pago, nota) → "Enviar pedido a {tienda}". |
| T3 | P0 | Stepper −/+ de 28 px y botón "+" de 32 px. | HIG 44 pt; WCAG 2.5.8 | Botones `h-11 w-11` (área táctil) con glifo visual de 32 px; separación ≥8 px. |
| T4 | P1 | Header sin info de la tienda (horario, abierto/cerrado, medios de pago, verificada). | Patrones (Rappi/Uber Eats store header); Baymard (trust signals) | Hero: foto 16:9 (o color + ícono), nombre `font-display text-headline`, línea "Abierto · Cierra 21:00 · 350 m", chips de medios de pago, sello verificada. |
| T5 | P1 | 6 controles de filtro sobre el fold (buscador, tabs, 2 selects, 2 precios): el catálogo empieza a mitad de pantalla. | Baymard (mobile filtering: filtros detrás de un botón, sort y filter separados) | Buscador sticky + fila de chips (tabs + categorías horizontales). "Ordenar" y "Precio" en un sheet de filtros con contador ("Filtros · 2"). |
| T6 | P1 | Fetch por cada tecla del buscador → la lista parpadea. | NN/g #1; M3 (evitar movimiento no causado por el usuario) | Debounce 250 ms + mantener lista previa con opacidad .6 mientras carga. |
| T7 | P1 | "Precio tachado" sin color de oferta; "12 disponibles" siempre visible (ruido). | Baymard (price presentation); NN/g #8 | Precio oferta en `text-accent-text font-bold` + chip "−15%"; stock sólo si ≤5 ("Quedan 3"). Precios con `tabular-nums`. |
| T8 | P2 | Sin feedback al agregar (el botón cambia a stepper en seco). | M3 (container transform / shared axis); HIG (feedback) | `scale-in` del stepper (160 ms) + "bump" del contador en la barra inferior (scale 1→1.12→1, `--ease-tactile`). |

### 2.4 Perfil, Mis pedidos, Detalle de pedido

| # | P | Problema | Guía | Recomendación |
|---|---|---|---|---|
| P1 | P0 | Detalle: ítems como "1× producto"; no dice qué tienda, ni cuándo, ni cómo retirar. | NN/g #6 (reconocer antes que recordar); Baymard (order confirmation) | Nombre de producto, tienda (link), fecha/hora, dirección de retiro, medio de pago y una *timeline* del estado (Pendiente → Confirmado → Listo → Entregado). |
| P2 | P0 | Mis pedidos: cada fila = badge + total. Imposible distinguir pedidos. | NN/g #6 | Fila: nombre de tienda (bold), fecha relativa ("hoy 18:40"), "3 productos", total `tabular-nums`, badge a la derecha. |
| P3 | P1 | Perfil prioriza editar nombre sobre "Mis pedidos" (tarea más frecuente), que está debajo del formulario. | NN/g #7 (flexibilidad/eficiencia); HIG (jerarquía por frecuencia) | Orden: avatar + nombre (header) → lista de navegación (Mis pedidos, Mis puntos, Mi lista, Mi tienda) → "Editar datos" en subpágina → Cerrar sesión. |
| P4 | P2 | "Volver al mapa" en detalle usa link de texto con "←" y color accent; otras pantallas usan ícono. | NN/g #4 | Unificar `BackButton` 44×44 con `aria-label`. |

### 2.5 Mi tienda (vendedor)

| # | P | Problema | Guía | Recomendación |
|---|---|---|---|---|
| V1 | P0 | "Rechazar" pedido y "Pausar tienda" sin confirmación ni deshacer. | NN/g #3 y #5 | Rechazar → sheet con motivo (sin stock / cerrado / otro). Pausar → confirm o snackbar "Tienda pausada · Deshacer" (M3 Snackbar, 4–10 s). |
| V2 | P0 | Caja de estado siempre verde (`bg-estado-entregado-bg`) aunque diga "Tienda pausada". | NN/g #1 y #4; WCAG 1.4.1 (no sólo color… y que el color no contradiga) | Pausada: `bg-estado-pendiente-bg text-estado-pendiente-text` + ícono pausa. Mejor: un `switch` "Visible en el mapa" (`role="switch"`). |
| V3 | P1 | Pedidos nuevos no se destacan (sin orden por urgencia, sin contador en el tab). | NN/g #1; Patrones (PedidosYa Partner: pendientes arriba) | Badge numérico en tab "Pedidos"; pendientes primero con borde `accent`; ítems con nombres. |
| V4 | P1 | Tabs "Tienda/Productos/Pedidos" construidas como botones `rounded-control` iguales a CTAs. | M3 (Tabs vs Buttons); WCAG 4.1.2 | `role="tablist"`/`tab`, estilo segmented control: fondo `bg-placeholder`, seleccionado `bg-surface shadow-card text-primary-dark`. |
| V5 | P2 | Horarios con `input type=time` de 30 px de alto. | HIG 44 pt | `h-11`; "Copiar a todos los días" para reducir carga. |

### 2.6 Login / Registro

| # | P | Problema | Guía | Recomendación |
|---|---|---|---|---|
| A1 | P1 | Sin `autoComplete` (`email`, `current-password`, `new-password`, `name`) ni "mostrar contraseña". | Baymard (password UX); WCAG 1.3.5 (Identify Input Purpose); WCAG 3.3.8 (Accessible Authentication) | Agregar atributos y botón ojo 44×44 dentro del input. |
| A2 | P1 | Errores genéricos sin asociar al campo. | NN/g #9; WCAG 3.3.1 | `aria-invalid` + `aria-describedby`; mensaje bajo el campo. |
| A3 | P2 | Color hardcodeado `border-[#c3e6db]` en registro. | Sistema de tokens | `--color-primary-border: #C3E6DB`. |
| A4 | P2 | Sin volver/cerrar; el login "flota" sin marca. | NN/g #3 | Wordmark arriba + botón cerrar que vuelve a `/`. |

---

## 3. Tipografía

**Situación actual.** `Fraunces` (serif "old-style soft", variable wght/opsz/SOFT/WONK) para display y
`Plus_Jakarta_Sans` (grotesca geométrica, 200–800) para UI. Problemas: (a) Fraunces en 17–22 px bold tiene contraste
de trazo alto y remates que a esos tamaños en pantallas de gama media se "empastan"; (b) su tono es de revista
gastronómica/boutique, no de almacén de la esquina; (c) se carga sin `axes: ["opsz"]`, así que no aprovecha el eje
óptico que la haría más robusta en tamaños chicos; (d) dos familias muy distintas en carácter (serif blanda + geométrica
fría) generan una marca menos unificada. HIG Typography recomienda priorizar legibilidad en tamaños de uso real y
limitar familias; M3 type scale pide que la fuente display funcione de 22 a 57 px.

### Alternativas evaluadas (todas en `next/font/google`)

| Criterio | A · `Bricolage_Grotesque` + `Plus_Jakarta_Sans` | B · `DM_Serif_Display` + `Manrope` | C · `Outfit` (sola) |
|---|---|---|---|
| Legibilidad mobile (13–22 px) | Muy buena: eje `opsz` 12–96 abre contrapesos en tamaños chicos; Jakarta ya probada en UI. | Display sólo sirve ≥24 px (un solo peso 400, alto contraste); Manrope excelente en UI. | Buena en títulos; en 13 px las formas geométricas (a/o circulares) se confunden y el tracking es corto. |
| Personalidad "barrio cálido + confianza" | Alta: grotesca con "ink traps" y formas algo irregulares → cartel pintado a mano, cercano; Jakarta aporta orden/confianza. | Elegante, "delicatessen"; menos barrio. | Neutra-tech (fintech/startup); poca calidez. |
| Pesos variables | wght 200–800 + `opsz` + `wdth` (75–100): permite condensar nombres de tienda largos en cards. | DM Serif Display: 1 peso estático (+ itálica). Manrope 200–800 variable. | 100–900 variable. |
| Soporte latino (á é í ó ú ñ ü ¿ ¡ $) | `latin`, `latin-ext` ✓ | ✓ / ✓ | ✓ |
| Números tabulares (precios) | Jakarta: `tnum` ✓ | Manrope: `tnum` ✓ | limitado |
| Rendimiento | +1 familia variable (~40–60 KB woff2 latin con ejes); Jakarta ya se carga. Neto ≈ igual que hoy. | Serif estática liviana (~20 KB) + Manrope variable. | La más liviana (1 familia). |
| Riesgo de cambio | Bajo: sólo cambia `--font-display`. | Medio: cambian ambas. | Medio: se pierde contraste display/UI. |

### Recomendación final

**Display: `Bricolage_Grotesque` · UI: `Plus_Jakarta_Sans`.**

Justificación: es la única opción que mejora personalidad *y* legibilidad a la vez (eje `opsz` = HIG "optimize for
size"), mantiene la familia UI que ya funciona (con `tnum` para precios) y la migración es de una línea de token.
El eje `wdth` resuelve nombres largos ("Verdulería y Despensa Don Tito") sin truncar. Ambas son grotescas, así que la
marca se lee unificada; la diferencia de carácter la pone el display en peso 700–800.

```ts
// src/app/layout.tsx
import { Bricolage_Grotesque, Plus_Jakarta_Sans } from "next/font/google";
const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage", subsets: ["latin", "latin-ext"], axes: ["opsz", "wdth"], display: "swap",
});
const jakarta = Plus_Jakarta_Sans({ variable: "--font-plus-jakarta", subsets: ["latin", "latin-ext"], display: "swap" });
```
```css
/* globals.css @theme */
--font-display: var(--font-bricolage), system-ui, sans-serif;
--font-sans: var(--font-plus-jakarta), system-ui, sans-serif;
```
Reglas de uso: display sólo en wordmark, H1/H2, nombre de tienda y totales grandes (`font-bold` 700, `tracking-[-0.01em]`);
UI 500 para cuerpo, 600 para labels/botones, 700 para precios; precios siempre `tabular-nums`. Cuerpo mínimo 15 px,
caption mínimo 12 px (HIG: nunca <11 pt). Validar en Claude Design antes de cerrar (el manual vigente dice Fraunces:
actualizar el canvas primero, igual que la spec).

---

## 4. Sistema de movimiento

Principios (M3 Motion + HIG Motion): el movimiento **explica** (de dónde viene y a dónde va un elemento), es **breve**
(la UI nunca espera a la animación) y es **opcional** (reduced-motion).

### 4.1 Tokens (en `@theme` de `globals.css`)

```css
@theme {
  /* Duraciones — M3: short3=150, short4=200, medium1=250, medium2=300 */
  --dur-instant: 100ms;  /* cambios de color/opacity en hover/pressed */
  --dur-fast:    160ms;  /* press, toggles, chips, stepper */
  --dur-base:    220ms;  /* entradas de lista, fade-up, popovers, place card */
  --dur-slow:    320ms;  /* bottom sheet, transiciones de pantalla, pin-drop */

  /* Curvas — Tailwind v4 genera ease-standard, ease-emphasized, etc. */
  --ease-standard:   cubic-bezier(0.2, 0, 0, 1);      /* M3 standard: cambios en el lugar */
  --ease-emphasized: cubic-bezier(0.2, 0, 0, 1);      /* M3 emphasized (aprox. CSS): transiciones de pantalla */
  --ease-decelerate: cubic-bezier(0.05, 0.7, 0.1, 1); /* M3 emphasized-decelerate: ENTRADAS */
  --ease-accelerate: cubic-bezier(0.3, 0, 0.8, 0.15); /* M3 emphasized-accelerate: SALIDAS */
  --ease-tactile:    cubic-bezier(0.34, 1.56, 0.64, 1); /* spring del manual: SOLO press/scale-in de elementos ≤ 64px */

  --animate-fade-in-down: fade-in-down var(--dur-base) var(--ease-decelerate) both;
  --animate-fade-up:      fade-up      var(--dur-base) var(--ease-decelerate) both;
  --animate-scale-in:     scale-in     var(--dur-fast) var(--ease-tactile)    both;
  --animate-pin-drop:     pin-drop     var(--dur-slow) var(--ease-decelerate) both;
  --animate-slide-up:     slide-up     var(--dur-slow) var(--ease-decelerate) both;
}
```

Reglas de asignación:
- **Entradas** → `--ease-decelerate`; **salidas** → `--ease-accelerate` y ~70% de la duración de entrada (M3: exits son más rápidas).
- **Cambios en el lugar** (color, tab seleccionado, altura de acordeón) → `--ease-standard` + `--dur-fast`.
- **Spring `--ease-tactile`** sólo en press (`scale(.96)`), aparición de badges/steppers y el "bump" del carrito — nunca en superficies grandes (sheet, pantalla), donde el overshoot se percibe como error (HIG: movimiento realista y sutil).
- Animar sólo `transform` y `opacity` (evita reflow; WCAG no lo exige pero M3 lo recomienda por fluidez).

### 4.2 Keyframes

```css
@keyframes fade-in-down { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: none; } }
@keyframes fade-up      { from { opacity: 0; transform: translateY(6px); }  to { opacity: 1; transform: none; } }
@keyframes scale-in     { from { opacity: 0; transform: scale(.92); }       to { opacity: 1; transform: none; } }
@keyframes slide-up     { from { transform: translateY(100%); }             to { transform: none; } }
@keyframes pin-drop {
  0%   { opacity: 0; transform: translateY(-14px) scale(.9); }
  60%  { opacity: 1; transform: translateY(0) scale(1.04); }
  100% { transform: translateY(0) scale(1); }
}
```
(`transform-origin: 50% 100%` en el pin, para que "apoye" la punta.)

### 4.3 Press / estados

```css
@utility press      { transition: transform var(--dur-fast) var(--ease-tactile), background-color var(--dur-instant) var(--ease-standard);
                      &:active { transform: scale(.96); } }
@utility press-soft { transition: transform var(--dur-fast) var(--ease-standard);
                      &:active { transform: scale(.985); } }
```
`press` en `Button`, íconos, chips, stepper; `press-soft` en cards/filas de lista. Quitar la regla global de `a:active`.

### 4.4 Escalonado (stagger)

- Delay por ítem **40 ms** (`style={{ animationDelay: i*40 + "ms" }}` o `--i` + `animation-delay: calc(var(--i) * 40ms)`).
- Máximo **6 ítems** escalonados; del 7º en adelante entran juntos con el 6º (tope ~240 ms), para que la lista nunca
  tarde más de ~460 ms en quedar completa (M3: la UI no espera la animación; NN/g: respuesta <0,5 s se percibe inmediata).
- Sólo en la **primera carga** de una lista; en refetch por filtro/búsqueda, cross-fade de 160 ms sin stagger (evita
  movimiento repetitivo, WCAG 2.2.2 espíritu).
- Stagger en orden de lectura (arriba→abajo), nunca aleatorio.

### 4.5 `prefers-reduced-motion`

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 1ms !important; animation-delay: 0ms !important;
    transition-duration: 1ms !important; scroll-behavior: auto !important;
  }
  .press:active, .press-soft:active { transform: none; }
}
```
Además en JS: `map.flyTo` → `map.setView` (sin animación) y sheet sin transición cuando
`matchMedia("(prefers-reduced-motion: reduce)").matches`. Mantener cambios de color/opacidad (HIG: "Reduce Motion"
reemplaza movimiento por fundidos, no elimina el feedback).

---

## 5. Intro de la home para no logueados (coreografía)

Objetivo: presentar marca → promesa → prueba (tiendas reales) → acción, en <700 ms. La dirección de cada entrada
sigue el **anclaje espacial** del elemento (M3 Transitions: los elementos entran desde el borde/contenedor con el que
se relacionan; HIG Motion: el movimiento debe ser coherente con la ubicación física del elemento).

| t (ms) | Elemento | Animación | Por qué esa dirección |
|---|---|---|---|
| 0 | Wordmark "Almacenia" (18 px, display) | `fade-in-down` −8px, 220 ms, decelerate | Está anclado al borde superior (zona de "barra"); baja desde su borde como un header. |
| 60 | H1 (propuesta de valor) | `fade-up` +6px, 220 ms | Contenido de lectura: sube hacia su lugar siguiendo el sentido de lectura/scroll. |
| 120 | Subtítulo | `fade-up` +6px, 220 ms | Mismo eje que el H1 (shared axis Y, M3). |
| 200 | Label "Cerca tuyo" | fade (opacity) 160 ms | Label estructural; sólo fade para no competir. |
| 240 / 280 / 320 | Cards 1–3 | `fade-up` +6px, 220 ms, stagger 40 ms | Lista: entradas escalonadas del manual. Si el fetch llega después de 240 ms, arrancan al llegar (con skeleton antes). |
| 280 | Barra CTA inferior | `slide-up` desde +16px con opacity, 320 ms, decelerate | Anclada al borde inferior: aparece desde su borde (patrón bottom sheet/bottom bar M3). |
| 600 | Botón CTA | una sola "respiración" `scale 1→1.02→1`, 400 ms, standard | Llama la atención sin loop infinito (WCAG 2.2.2: nada que se mueva >5 s). |

Detalles:
- La barra CTA entra junto con las cards (no al final): la acción principal debe estar disponible cuanto antes (NN/g #7).
- Skeleton de 3 cards visible desde t=0 (sin animación de entrada), reemplazado por cross-fade 160 ms.
- Sólo en la primera visita de la sesión (`sessionStorage`); al volver desde login, sin intro.
- Reduced-motion: todo aparece con fade de 1 ms (sin desplazamiento).

---

## 6. Mapa: pin y *place card*

### 6.1 Pin con ícono de tienda

`L.divIcon({ html: svg, className: "pin", iconSize: [44, 52], iconAnchor: [22, 50] })` — área de toque 44×52
(HIG 44 pt), gota visual 36×44.

| Estado | Visual | Motion |
|---|---|---|
| **Normal (abierta)** | Gota `fill: #0E6B5C`, borde 2px blanco, sombra `0 2px 4px rgb(32 26 21/.25)`; glifo blanco 18 px según tipo: almacén (canasta), kiosco (caramelo/golosina), verdulería (hoja/zanahoria). | `pin-drop` al cargar, stagger 30 ms por pin, máx. 10 escalonados. |
| **Seleccionado** | `scale(1.2)`, `fill: #E2723A`, borde 3 px blanco, `z-index` arriba de todos, halo `#E2723A` 20% bajo la punta; label con el nombre en chip blanco sobre el pin (patrón Airbnb: el pin seleccionado cambia color y se agranda). | `transform` 160 ms `--ease-tactile`; el resto de pines no se mueve. |
| **Cerrada** | `fill: #8C8178` (3,8:1 vs blanco, cumple WCAG 1.4.11), glifo blanco, pequeño punto/luna en la esquina; opacidad 0,85. No depender sólo del color: el ícono de "cerrado" cambia la forma (WCAG 1.4.1). | Igual que normal. |
| **Usuario** | Punto terracota 16 px con aro blanco + pulso `#E2723A` 20% (2 ciclos y se detiene). | Sin pulso en reduced-motion. |

Además: `aria-label` en el marker ("Almacén Don Tito, abierto, a 350 m"); clustering con número (`leaflet.markercluster`)
a zoom ≤13 (Google Maps/Airbnb) — P2.

### 6.2 Place card (reemplaza al popup blanco de Leaflet)

Patrón Google Maps place card / Uber Eats: al tocar un pin, el bottom sheet se colapsa y aparece una **card flotante
anclada abajo** (encima del sheet colapsado), no un globo sobre el mapa (el globo tapa pines vecinos y queda fuera del
pulgar; Baymard/HIG: acciones principales en la zona inferior alcanzable).

```
┌─────────────────────────────────────────────┐
│ [foto 72×72]  Almacén Don Tito  ✓verificada │  ← nombre: font-display 17px bold; ✓ ícono teal + "Verificada" (sr-only)
│  r-control    Almacén · 350 m · 4 min a pie │  ← text-label text-text-2, tabular-nums
│               ● Abierto · Cierra a las 21:00│  ← ● #1E7A3D + texto estado-entregado-text (5,38:1)
│               [Efectivo] [MP] [Débito]      │  ← chips 11px (opcional, máx. 3)
│                                         ›   │  ← chevron 20px: toda la card es tocable
└─────────────────────────────────────────────┘
  [ Ver tienda ]  (botón primary full-width dentro de la card, 44px)
```

- **Jerarquía**: 1) nombre + verificada, 2) estado abierto/cerrado (es lo que decide si ir), 3) distancia/tiempo,
  4) medios de pago. (Rappi/PedidosYa ponen el estado en la 2ª línea con color.)
- **Estado** (texto siempre explícito, no sólo color — WCAG 1.4.1):
  - Abierta: `● Abierto · Cierra a las 21:00`; si cierra en ≤30 min: `● Cierra pronto · 20:30` en `estado-pendiente-text`.
  - Cerrada: `● Cerrado · Abre mañana 09:00` / `Abre hoy 17:00` / `Abre el lunes 09:00` en `estado-rechazado-text`;
    card con foto en `grayscale(.6)` y CTA secundario "Ver catálogo" (outline) en vez de primary.
- **Foto**: `imagenUrl` de la tienda, `object-cover`, placeholder = `bg-primary-soft` con glifo del tipo.
- **Affordance de tocable**: card completa `Link` con `press-soft`, chevron `›` a la derecha, sombra `shadow-float`
  y botón explícito "Ver tienda" (HIG: los elementos interactivos se ven interactivos; NN/g #6).
- **Motion**: entra con `slide-up` 16px + fade 220 ms decelerate; al cambiar de pin, cross-fade del contenido 160 ms
  (la card no sale y vuelve a entrar). Swipe-down o tap en el mapa la cierra (salida 160 ms accelerate).
- **Datos**: `/api/tiendas/cercanas` hoy no devuelve horario, foto, verificada ni medios de pago → **actualizar la spec
  (`specs/sdd/02-tiendas.md`) antes** de implementar (CLAUDE.md). Cálculo "Abre mañana 09:00" en `src/lib/tiendas/` con test.

---

## 7. Pantallas nuevas

### 7.1 Puntos (gamificación)

**Chip en el mapa** (barra superior, entre wordmark y perfil):
- `rounded-pill bg-surface/95 shadow-float h-11 px-3 gap-1.5`: ícono moneda/estrella 16 px `text-accent` + número
  `font-bold tabular-nums text-text` ("1.240"). `aria-label="Tenés 1240 puntos, ver historial"`.
- Al ganar puntos: el chip hace `scale-in` del "+50" (chip flotante `bg-accent-dark text-white` que sube 12px y se
  desvanece en 600 ms) y el número hace *count-up* 400 ms (standard). Sin confeti ni loops (NN/g #8; WCAG 2.2.2).
- Tap → `/perfil/puntos`. No bloquear el mapa ni mostrar modales de logro al abrir (NN/g: evitar interrupciones).

**Historial en perfil** (`/perfil/puntos`):
- Header: saldo grande `font-display text-display tabular-nums` + "≈ $X de descuento" (valor concreto = motivación;
  Baymard: mostrar el beneficio en moneda). Barra de progreso al próximo nivel/beneficio con texto ("Te faltan 260").
- "Cómo sumar": 3 filas con ícono (comprar, reseñar, verificar tienda).
- Lista agrupada por mes: fila = motivo ("Pedido en Almacén Don Tito"), fecha, delta `+50` en `text-estado-entregado-text`
  / `−200` en `text-text-2` (signo explícito, no sólo color). Entrada `fade-up` stagger 40 ms (máx. 6).

### 7.2 Lista de compras (`/lista`)

Patrón: lista persistente reutilizable (Baymard: "save for later"/listas recurrentes; Rappi "Mis listas").
- **Buscador del catálogo** sticky arriba (`h-12`, ícono lupa, `inputMode="search"`, `enterKeyHint="search"`).
  Autocompletado agrupado por categoría con foto 32 px; resultado tocable completo 48 px de alto. Si no hay match:
  "Agregar «pan de campo» como texto libre" (NN/g #9; permite comparar después por nombre).
- **Ítems**: nombre + stepper de cantidad (44×44) + unidad (u / kg / pack); swipe para borrar con snackbar
  "Eliminado · Deshacer" (NN/g #3). Agregar ítem → `scale-in` + scroll suave al ítem.
- **Barra inferior sticky** (`bg-surface border-t pb-[env(safe-area-inset-bottom)]`), dos botones:
  `Guardar` = `outline` (1/3 ancho) · `Buscar y comparar` = `primary` (2/3 ancho, derecha, con contador "12 productos").
  La acción principal va a la derecha y más grande (M3 button hierarchy; HIG: una acción primaria por vista).
  Deshabilitar comparar con <1 ítem mostrando por qué (tooltip/texto), no sólo `opacity-50`.
- Guardado: auto-guardar borrador (sin perder datos, NN/g #5) y "Guardar" pide nombre ("Compra del sábado") en sheet.

### 7.3 Resultados de comparación — "Planes de compra"

Patrón: comparador de rutas de Google Maps (opciones con trade-off explícito) + resumen de carrito de Uber Eats.
- **Header**: "12 productos · 5 tiendas cerca" + chip de radio ("≤ 1 km") editable.
- **Cards de plan** (máx. 3, apiladas, la recomendada primero con borde `primary` y chip "Recomendado"):
  1. **Más barato** — "2 tiendas · $18.450 · ahorrás $2.300" (ahorro vs. plan de 1 tienda, `text-estado-entregado-text`).
  2. **Una sola parada** — "1 tienda · $20.750 · 11/12 productos".
  3. **Más cerca** — "2 tiendas · 600 m en total".
  Cada card: total `font-display text-headline tabular-nums`, línea de trade-off, cobertura "11/12" con el faltante
  nombrado ("Falta: yerba Playadito"), mini-mapa/recorrido o avatares de tiendas en orden de visita, estado
  Abierto/Cerrado de cada tienda (una tienda cerrada invalida el plan → marcarlo, no esconderlo).
- **Detalle del plan** (expandible con `--ease-standard` 220 ms o pantalla con transición shared-axis X):
  agrupado por tienda → productos, precio unitario, subtotal; tienda con foto, distancia y horario.
- **CTAs**: primary "Hacer pedidos (2)" → crea un pedido por tienda con revisión previa (Baymard order review);
  secundario "Ver recorrido en el mapa" (itinerario de compra, pines numerados 1→2 en color `primary` + polilínea).
- **Transparencia de precios**: "Precios actualizados hace 2 h" y aviso si una oferta vence hoy (Baymard: trust).
- **Motion**: cards de plan entran `fade-up` stagger 60 ms (son pocas y grandes); cambiar el radio re-ordena con
  cross-fade 160 ms, no con animación de reordenamiento (reduce distracción).
- Spec primero: alinear estos flujos con `specs/sdd/12-gamificacion.md`, `14-listas-compras.md` y `15-itinerario.md`; si la UI
  pide datos que esas specs no definen (ahorro, cobertura, orden de visita), ampliar la spec antes del código.

---

### Anexo — contraste medido (WCAG 2.2)

| Par | Ratio | Resultado |
|---|---|---|
| `text-2` #6B6058 / `bg` #FBF8F3 | 5,76 | AA ✓ |
| `primary` #0E6B5C / `bg` | 6,05 | AA ✓ |
| blanco / `primary` | 6,41 | AA ✓ |
| `accent` #E2723A / `bg` (links) | 2,96 | ✗ → usar #B85423 (4,58) |
| blanco / `accent` (botón) | 3,13 | ✗ (sólo texto grande) → `accent-dark` 4,85 |
| `border` #E7E0D5 / blanco (inputs) | 1,31 | ✗ 1.4.11 → #8C8178 (3,8) |
| `estado-entregado-text` / blanco ("Abierto") | 5,38 | AA ✓ |
| `estado-rechazado-text` / blanco ("Cerrado") | 5,66 | AA ✓ |
