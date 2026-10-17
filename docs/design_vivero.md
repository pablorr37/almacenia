# Design: vivero (ingeniería inversa de "Vivero Las Lilas")

Referencia de estilo para el tema `vivero` de Permia (`specs/sdd/21-temas.md`).
Sale de dos páginas de muestra que hizo **Domo** para Vivero Las Lilas (cactus y
suculentas, Santa Lucía, San Juan):

- **Versión A:** `domo.firemandeveloper.com/demo/viverolaslilas-a/`. HTML completo
  (lo pegó el usuario el 2026-10-17) más la carpeta `_files`. Todo lo de este
  documento sale de ahí, salvo la sección "Versión B".
- **Versión B:** `…/viverolaslilas-b/`. Solo llegó la carpeta `_files` (fuentes y
  fotos), sin el `.html` principal. De la B se conocen la tipografía y las fotos;
  faltan los colores, el layout y los SVG.

Son prototipos de un tercero: se toma el **lenguaje visual** (tokens, patrones,
íconos de dibujo simple), no el contenido, las fotos ni la marca "Las Lilas".

---

## 1. Carácter

Vivero **editorial, de papel y tinta**. No es "verde chillón": fondo de papel cálido,
texto casi negro con un toque violeta, **dos acentos botánicos**: violeta lila (la
flor) y verde hoja (el tallo). Serif óptica liviana para títulos, sans neutra para el
texto y **monoespaciada para datos** (números, rótulos, medidas), como una ficha de
herbario o un plano de jardín.

Rasgos que lo definen:
- **Esquinas rectas** (`border-radius: 0`) en botones, campos, tarjetas y filtros.
  Solo son redondos los puntos (estado, viñetas, check).
- **Líneas finas** de 1px (`--hilo`) separan secciones, cabeceras y renglones; casi
  no hay sombras.
- **Papel cuadriculado**: retícula violeta muy tenue de 24px en algunas secciones.
- **Secciones "noche"**: bloques de fondo violeta casi negro con texto lavanda.
- **Rótulos en mono** sobre las fotos ("Imagen ilustrativa") y numeración `01 / 04`.
- **Itálica** de la serif para la marca y para palabras destacadas ("Su *lista*").
- Fotos con **zoom lento** (Ken Burns, 28 s) en la portada y polaroid girada 3°.

## 2. Tokens

### Color (`:root` de la versión A)

| Token | Valor | Uso |
| --- | --- | --- |
| `--papel` | `#F3F1EC` | fondo general, `theme-color` |
| `--papel-2` | `#EBE8E1` | hover de botones de cantidad |
| `--tinta` | `#1F1A26` | texto, bordes de botones y campos |
| `--tinta-2` | `#4A4452` | texto secundario, nav |
| `--tinta-3` | `#6E6876` | texto terciario, metadatos |
| `--noche` | `#1C1622` | secciones oscuras, pie, barra "prototipo" |
| `--noche-2` | `#272030` | fondo de fotos en secciones oscuras |
| `--violeta` | `#6B3E98` | lila: estrellas, viñetas, foco, flor del logo |
| `--violeta-t` | `#4E2A72` | violeta para texto: logo, links, numeración, cotas |
| `--verde` | `#2F6B3A` | verde hoja: botón primario, "abierto", seleccionado, tallo del logo |
| `--verde-o` | `#245530` | hover del botón primario |
| `--hilo` | `rgba(31,26,38,.16)` | líneas de 1px |
| `--hilo-2` | `rgba(31,26,38,.08)` | líneas entre renglones |
| `--reticula` | `rgba(78,42,114,.055)` | cuadriculado del papel |
| `--vacio` | `#ECE6DC` | fondo de foto mientras carga |

Colores sueltos: `#FBFAF7` (fondo de la lista y de las cotas), `#F7F5F0` (polaroid),
`#fff` (campos), `#DCD6E2` (texto de la barra prototipo), `#EEE9F1` (texto en
noche), `#C9C1D1` (párrafos en noche), `#BFA8D8` (numeración en noche), `#E7E1EC`
(párrafo sobre foto), `#E6DCF1` / `#B9B0C3` (logo en el pie).

Transparencias: `rgba(28,22,34,.55)` (rótulo sobre foto), `rgba(28,22,34,.16)`
(velo de la portada), `rgba(28,22,34,.5)` (pie de foto), `rgba(243,241,236,.94)` +
`blur(8px)` (cabecera fija), `rgba(47,107,58,.14)` (halo del punto "abierto"),
`rgba(47,107,58,.4)` (borde de la etiqueta "Especialidad").

**Contraste** (WCAG, medido):

| Par | Razón |
| --- | --- |
| blanco / `--verde` | 6,39 |
| blanco / `--verde-o` | 8,69 |
| blanco / `--violeta` | 7,59 |
| blanco / `--violeta-t` | 11,06 |
| `--tinta` / papel | 15,08 |
| `--tinta-2` / papel | 8,31 |
| `--tinta-3` / papel | 4,76 |
| `--violeta-t` / papel | 9,80 |
| `--violeta` / papel | 6,72 |
| `--verde` / papel | 5,66 |
| `#C9C1D1` / noche | 10,13 |
| `#BFA8D8` / noche | 8,26 |

Todo pasa el mínimo de 4,5:1 que exige Permia.

### Tipografía

```html
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..500;1,9..144,300..400&family=Public+Sans:wght@400;500;600&family=DM+Mono:wght@300;400&display=swap" rel="stylesheet">
```

| Rol | Familia | Pesos | Detalles |
| --- | --- | --- | --- |
| Títulos (`--serif`) | **Fraunces**, Georgia, serif | 300–500 normal, 300–400 itálica | `h1,h2,h3` en peso **350**, `line-height:1.08`, `font-variation-settings:"opsz" 96`; `h3` en 400 |
| Texto (`--sans`) | **Public Sans**, system-ui | 400, 500, 600 | cuerpo 16,5px (16px en celular), `line-height:1.6` |
| Datos (`--mono`) | **DM Mono**, ui-monospace, Menlo | 300, 400 | `.mono`: peso 300, `letter-spacing:.02em` |

Escala:

| Elemento | Tamaño |
| --- | --- |
| h1 de portada | `clamp(46px,5.2vw,84px)`, `letter-spacing:-.01em`, `max-width:11ch` |
| h2 | `clamp(34px,3.6vw,56px)` |
| h3 | `clamp(22px,1.8vw,28px)` |
| h2 de la sección de foto | `clamp(40px,5.4vw,88px)` |
| bajada | `clamp(17px,1.35vw,20px)`, `line-height:1.55`, `max-width:34em` |
| nota grande (4,6) | serif 300, `clamp(64px,7vw,110px)` |
| cita de reseña | serif 300, 21px, `line-height:1.4` |
| marca (logo) | serif **itálica 300**, 27px en la cabecera, 44px en la portada, 40px en el pie |

Sobrerrótulo `.vers` y labels: sans 12px, peso 500, `letter-spacing:.14em–.26em`,
`text-transform:uppercase`. `em` e `.it`: itálica peso 300.

### Espaciado y layout

```css
--lado: clamp(20px,2.8vw,60px);   /* margen lateral */
--aire: clamp(88px,10vw,150px);   /* padding vertical de sección */
```

- Cabecera fija de 64px de alto mínimo; `scroll-padding-top:72px`.
- Cabecera de sección (`.sec-cab`): grilla de 2 columnas, título a la izquierda y
  bajada a la derecha, alineadas abajo, con línea inferior.
- Portada partida: texto (`clamp(380px,40vw,660px)`) | foto, con línea vertical
  entre las dos.
- Cortes de responsive: 1100px, 900px (todo a una columna y barra fija abajo),
  620px.

### Bordes, sombras y movimiento

- `border-radius: 0` en todo, salvo los puntos de estado o viñeta y la marca de
  check (50%).
- Sombras: solo la polaroid (`0 18px 40px rgba(0,0,0,.28)`). La selección se marca
  con **sombra interna verde**:
  - tarjeta elegida: `box-shadow: inset 0 -2px 0 var(--verde)`;
  - fila elegida: `box-shadow: inset 3px 0 0 var(--verde)`.
- Foco: `outline: 2px solid var(--violeta); outline-offset: 3px`.
- Transiciones: `background .2s, color .2s`; borde `.2s`; zoom de foto
  `transform .6s` (escala 1.03 en hover).
- Ken Burns de la portada, respeta `prefers-reduced-motion`:

```css
.portada-foto img{transform-origin:62% 48%;animation:kb 28s ease-in-out infinite alternate}
@keyframes kb{from{transform:scale(1.03) translate(0,0)}to{transform:scale(1.16) translate(-2.2%,-1.4%)}}
@media (prefers-reduced-motion:reduce){.portada-foto img{animation:none;transform:none}}
```

## 3. Componentes

**Botones.** Rectos, alto mínimo 48px (44px en la cabecera), borde de 1px de tinta,
peso 500.

```css
.btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;min-height:48px;padding:0 22px;border:1px solid var(--tinta);background:transparent;font-size:15px;font-weight:500;border-radius:0;transition:background .2s,color .2s}
.btn-p{background:var(--verde);border-color:var(--verde);color:#fff}   /* primario */
.btn-p:hover{background:var(--verde-o)}
.btn-f:hover{background:var(--tinta);color:var(--papel)}               /* fantasma: se rellena de tinta */
```

**Segmentado** (Retiro / Envío): dos botones dentro de un borde de tinta; el activo
se rellena de tinta con texto papel. Los **filtros** usan el mismo patrón, en pills
rectas.

**Tarjeta de opción** (`.opc`): foto 4:3, título 15,5px peso 500 y detalle en mono
12px. Arriba a la derecha, un círculo de 22px que se pone verde con un check blanco
al elegir la opción. El check se dibuja con CSS:

```css
.opc[aria-pressed="true"] .marca{background:var(--verde);border-color:var(--verde)}
.opc[aria-pressed="true"] .marca::after{content:"";position:absolute;left:7px;top:4px;width:5px;height:9px;border:solid #fff;border-width:0 1.5px 1.5px 0;transform:rotate(45deg)}
```

**Fila de opción** (`.fila-opc`): ícono de línea de 34px en violeta-t, título y
detalle. Etiqueta opcional a la derecha en mono verde con borde verde translúcido
("Especialidad").

**Ficha de producto** (`.ficha`): foto 4:5, nombre en serif 21px (18px en
celular) y detalle. Debajo, una lista de datos en mono 12px separada por una línea
(luz · riego · tamaño); el precio va en violeta-t. Al pie, el botón "Sumar a mi
lista": recto, con borde de tinta, y una vez sumado pasa a verde ("En su lista").

**Campo numérico** (`.num-in`): `− [valor] +` dentro de un borde de tinta, alto 52px,
valor en mono 18px.

**Labels** (`.lbl`): sans 12px, peso 500, mayúsculas, `letter-spacing:.14em`.

**Estado abierto/cerrado:** punto de 8px gris; si está abierto, verde con halo
`0 0 0 4px rgba(47,107,58,.14)` y el texto "Abierto ahora" en verde.

**Viñetas de datos** (`.datos3`): punto violeta de 6px sobre cada dato en mono.

**Rótulo de foto:** mono 11px blanco sobre `rgba(28,22,34,.55)`, abajo a la
izquierda ("Imagen ilustrativa").

**Polaroid:** marco `#F7F5F0`, padding `12px 12px 16px`, rotado 3°, epígrafe en serif
itálica 17px.

**Horario:** tabla en mono 300; el día de hoy en peso 400 con un punto verde.

**Toast:** fondo tinta, texto papel, rectángulo sin radio, sube 20px al aparecer.

**Barra fija de celular** (menos de 900px): "Mi lista (n)" y el botón primario de
WhatsApp, sobre papel translúcido con línea superior.

**Papel cuadriculado:**

```css
.papel{background-color:var(--papel);background-image:linear-gradient(var(--reticula) 1px,transparent 1px),linear-gradient(90deg,var(--reticula) 1px,transparent 1px);background-size:24px 24px;background-position:-1px -1px}
```

## 4. SVG (textuales)

### Logo "ramito" de lilas (`<symbol id="ramito">`, viewBox 34×40)

Racimo de 11 círculos violeta con 4 brillos papel, un tallo y dos hojas verdes. En
la cabecera va a 34×40, en la portada a 52×62 y en el pie a 46×54.

```html
<symbol id="ramito" viewBox="0 0 34 40">
  <g fill="#6B3E98">
    <circle cx="18" cy="3.6" r="2.3"/><circle cx="15" cy="6.6" r="2.3"/><circle cx="20.6" cy="7" r="2.3"/>
    <circle cx="12.6" cy="10.4" r="2.4"/><circle cx="17.6" cy="10.6" r="2.5"/><circle cx="22.8" cy="11.2" r="2.2"/>
    <circle cx="11" cy="14.8" r="2.3"/><circle cx="15.8" cy="15.2" r="2.5"/><circle cx="20.8" cy="15.6" r="2.3"/>
    <circle cx="13.6" cy="19.4" r="2.2"/><circle cx="18.4" cy="19.8" r="2.1"/>
  </g>
  <g fill="#F3F1EC" opacity=".55"><circle cx="17.6" cy="10.6" r=".7"/><circle cx="15.8" cy="15.2" r=".7"/><circle cx="20.6" cy="7" r=".6"/><circle cx="12.6" cy="10.4" r=".6"/></g>
  <path d="M16 21.5 L11.5 38" stroke="#2F6B3A" stroke-width="1.3" fill="none" stroke-linecap="round"/>
  <path d="M13.2 31.5c-6-1.6-9.4.8-11 4.8 5.2.4 9-1.2 11-4.8z" fill="#2F6B3A"/>
  <path d="M14.4 27.4c4.4-3.6 8.6-3 11.4-.2-3.6 2.6-7.6 2.8-11.4.2z" fill="#2F6B3A"/>
</symbol>
```

Composición del logo: ramito + bloque de texto. Arriba, "VIVERO" en sans 10,5px,
mayúsculas, `letter-spacing:.24em`, tinta-2. Debajo, el nombre en serif itálica 300
con un **subrayado verde de 1px** (`border-bottom:1px solid var(--verde)`). En la
portada se suma un sub en mono: "Cactus · San Juan". La cabecera esconde su logo
mientras se ve el de la portada (IntersectionObserver).

### Favicon (viewBox 32×32, versión simplificada del ramito)

```html
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><g fill="#6B3E98"><circle cx="17" cy="5" r="2.4"/><circle cx="13.5" cy="8.5" r="2.4"/><circle cx="20" cy="8.8" r="2.4"/><circle cx="16.5" cy="12" r="2.6"/><circle cx="12" cy="13.5" r="2.4"/><circle cx="20.5" cy="14" r="2.2"/><circle cx="15.5" cy="17" r="2.2"/></g><path d="M15 18 L11 29" stroke="#2F6B3A" stroke-width="1.6" fill="none"/><path d="M12.5 24c-5-1-7 1-8 4 4 0 7-1 8-4z M13.5 22c4-3 7-2 9 0-3 2-6 2-9 0z" fill="#2F6B3A"/></svg>
```

### WhatsApp (`<symbol id="wa">`, viewBox 24×24, `currentColor`)

```html
<symbol id="wa" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2c-1.6 0-3.1-.4-4.4-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.4.1-.7.3-.2.3-.9.9-.9 2.2s.9 2.5 1 2.7c.1.2 1.8 2.8 4.4 3.9 1.6.7 2.3.8 3.1.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.6-.3z"/></symbol>
```

### Íconos de luz (viewBox 34×34, línea de 1,2, `currentColor`)

```html
<!-- Sol pleno -->
<svg class="ico" viewBox="0 0 34 34" fill="none" stroke="currentColor" stroke-width="1.2"><circle cx="17" cy="17" r="6"/><path d="M17 3v5M17 26v5M3 17h5M26 17h5M7 7l3.5 3.5M23.5 23.5 27 27M27 7l-3.5 3.5M10.5 23.5 7 27"/></svg>
<!-- Media sombra (la nube tapa al sol, relleno papel) -->
<svg class="ico" viewBox="0 0 34 34" fill="none" stroke="currentColor" stroke-width="1.2"><circle cx="14" cy="15" r="5.5"/><path d="M14 4v3M4 15h3M6.5 7.5l2 2M21.5 7.5l-2 2"/><path d="M12 27h15a5 5 0 0 0 0-10 7 7 0 0 0-13 2 4 4 0 0 0-2 8z" fill="#F3F1EC"/></svg>
<!-- Sombra o interior (ventana) -->
<svg class="ico" viewBox="0 0 34 34" fill="none" stroke="currentColor" stroke-width="1.2"><rect x="7" y="5" width="20" height="24"/><path d="M17 5v24M7 17h20"/></svg>
```

### Flecha del `<select>` (data URI)

```css
background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%231F1A26' fill='none'/%3E%3C/svg%3E");
background-repeat:no-repeat;background-position:right 14px center;padding-right:36px
```

### Croquis en planta (se genera en JS)

Esquema "vista de arriba" del cantero, el balcón o el interior, con las plantas como
marcas. Las cotas van en violeta-t y los textos en DM Mono 10px `#6E6876`. Sirve de
modelo para un "plano de compra" en Permia.

```js
// 4 marcas de planta (se rotan por especie)
'<circle cx cy r fill="rgba(107,62,152,.18)" stroke="#4E2A72" stroke-width="1"/>'                       // violeta
'<circle cx cy r fill="rgba(47,107,58,.2)" stroke="#2F6B3A" stroke-width="1"/>'                         // verde
'<circle … fill="none" stroke="#1F1A26" stroke-width="1"/><circle … r=r*.3 fill="#1F1A26"/>'            // anillo con centro
'<circle cx cy r fill="#F3F1EC" stroke="#1F1A26" stroke-width="1" stroke-dasharray="2 2"/>'             // punteada
// Superficie: rect fill="rgba(236,230,220,.6)" stroke="#1F1A26" stroke-width="1"
// Cota horizontal:
'<path d="M x1 y H x2 M x1 (y-4) v8 M x2 (y-4) v8" stroke="#4E2A72" stroke-width=".8"/>'
'<rect … fill="#FBFAF7"/><text … class="tx" style="fill:#4E2A72">3 m</text>'
// Estilo de texto: .tx{font:10px "DM Mono",monospace;fill:#6E6876}
// Pie: "vista de arriba · esquema", alineado a la derecha.
```

## 5. Estructura de la página (A)

1. **Barra de prototipo** (noche, mono): "PROTOTIPO · página de muestra…".
2. **Cabecera fija** translúcida: logo, nav (Arme su lista · Plantas y macetas ·
   Cuidados · Horario y cómo llegar) y botón fantasma de WhatsApp.
3. **Portada partida:** a la izquierda sobre papel cuadriculado, el logo grande y
   el h1 "Arme su cantero o su balcón", con bajada, estado (abierto o cerrado),
   ★★★★★ 4,6, los botones Empezar y Ver todas las plantas, y tres datos en mono con
   viñeta violeta. A la derecha, foto del invernadero con Ken Burns y pie en mono.
4. **"Arme su lista"** (papel): asistente de 4 pasos (Espacio con tarjetas de foto,
   Sol, Medidas, Estilo y riego) y, en una columna fija a la derecha, la lista
   generada con croquis, renglones agrupados (Plantas / Macetas / Tierra y piedra),
   entrega y envío por WhatsApp.
5. **"Cómo funciona"** (noche): 3 pasos con foto 4:5, numeración en mono lavanda.
6. **"Plantas y macetas"**: filtros por categoría y grilla de fichas
   (`minmax(250px,1fr)`), con "Ver los N productos".
7. **Producción propia:** foto a sangre al 50 % sobre noche, h2 enorme blanco y
   polaroid girada.
8. **"Cuidados"** (papel): 3 columnas con línea superior de tinta (`01 · Sol`,
   `02 · Riego`, `03 · Tierra`), asesoramiento por WhatsApp, horario, cómo llegar,
   mapa (iframe con `grayscale(.35)`) y reseñas (nota grande y 3 citas en serif).
9. **Pie** (noche): logo claro, datos y crédito.

Voz: trato de **usted**, frases cortas, rioplatense formal ("Arme su lista",
"Díganos el lugar").

## 6. Versión B: lo que se sabe

- **Tipografía:** Cormorant Garamond (400, 500 y 600, normal e itálica) y Jost (300,
  400, 500). Es la misma pareja que el tema `vinos` de Permia: la versión B es la
  variante elegante de serif clásica.
- **Fotos:** las mismas de la A (portada, cantero, piedras, tierra, aloe,
  echinopsis) más fichas de macetas (barro N°18, barro chicas, cerámica, cemento,
  plástico) y plantas (jazmín, lavanda, malvón, potus). El catálogo de la B muestra
  más macetas y flores.
- **Falta:** el `.html` principal de la B (colores, layout, SVG). Para completarla,
  guardar la página con "Guardar como → Página web, solo HTML" o pegar el código
  fuente, como se hizo con la A.

## 7. Cómo llevarlo al tema `vivero` de Permia (propuesta, sin aplicar)

El tema `vivero` actual (verde hoja `#15803d`, terracota, Outfit) es más "app".
Este design propone un vivero **editorial** sobre papel. Mapeo a `ColoresTema`
(`src/lib/tema/tema.ts`), con todos los pares medidos arriba en 4,5:1 o más:

| Token Permia | Valor Las Lilas |
| --- | --- |
| `primary` | `#2F6B3A` (verde) |
| `primaryDark` | `#245530` (verde-o) |
| `primarySoft` | `#E3EBDF` (propuesto: verde muy claro sobre papel) |
| `accent` | `#6B3E98` (violeta) |
| `accentDark` | `#4E2A72` (violeta-t) |
| `accentText` | `#4E2A72` |
| `text` | `#1F1A26` |
| `text2` | `#4A4452` |
| `bg` | `#F3F1EC` |
| `surface` | `#FBFAF7` |
| `border` | `#DAD6CF` (≈ hilo sólido) |
| `placeholder` | `#ECE6DC` (vacío) |
| fuentes | display `fraunces` (opsz 96, peso 350) + sans `public-sans`; mono `dm-mono` para datos |
| radios | control **0**, card **0** |
| ícono de marca | ramito (circulitos lila + tallo verde) en lugar de la planta de línea |

Para aplicarlo hace falta, además:
- sumar las fuentes Fraunces, Public Sans y DM Mono a `src/app/fuentes.ts`;
- un token de fuente mono, que hoy Permia no tiene;
- que los íconos de marca acepten SVG de **relleno a dos colores** (hoy son de
  línea con `currentColor`).

Decidir antes:
1. ¿Reemplaza al `vivero` actual o se suma como un rubro o variante nueva (ej.
   `vivero-editorial`)?
2. ¿Se trae la mecánica "Arme su lista" (asistente por espacio, sol y medidas, con
   croquis y envío por WhatsApp) como feature de Permia?
