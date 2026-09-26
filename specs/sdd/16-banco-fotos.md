# Módulo: banco de fotos

Convenciones comunes: ver [`00-overview.md`](00-overview.md). Depende de
[`01-auth.md`](01-auth.md) (flag `esTester`), [`06-catalogo.md`](06-catalogo.md)
(foto del catálogo), [`08-archivos.md`](08-archivos.md) (bucket) y
[`10-planes.md`](10-planes.md) (qué ve cada plan).

Las fotos de productos salen de un **banco propio** que se arma a mano desde la app:
los curadores (admin y usuarios *tester*) buscan fotos libres de derechos en la web
y aprueban las que sirven. El mismo buscador lo usa el seed. Todos los usuarios
usan **la misma UI** (`BuscadorFotos`); solo cambia qué fuentes ve cada uno.

## Modelo de datos

```sql
CREATE TYPE fuente_foto AS ENUM ('web', 'subida');
CREATE TYPE estado_foto AS ENUM ('pendiente', 'aprobada', 'rechazada');

CREATE TABLE fotos_banco (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url              TEXT NOT NULL,             -- siempre en nuestro bucket (bancofotos/<id>/<uuid>.<ext>)
  fuente           fuente_foto NOT NULL,
  estado           estado_foto NOT NULL DEFAULT 'pendiente',
  etiquetas        TEXT[] NOT NULL DEFAULT '{}', -- minúsculas, sin tildes
  titulo           TEXT,
  autor            TEXT,
  licencia         TEXT,                      -- 'cc0' | 'pdm' | 'propia'
  origen_url       TEXT UNIQUE,               -- página de la fuente web: evita duplicados
  subida_por_id    UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  revisada_por_id  UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  creada_en        TIMESTAMPTZ NOT NULL DEFAULT now(),
  revisada_en      TIMESTAMPTZ
);
CREATE INDEX fotos_banco_estado_fuente_idx ON fotos_banco (estado, fuente);
CREATE INDEX fotos_banco_etiquetas_idx ON fotos_banco USING GIN (etiquetas);
```

`usuarios.es_tester BOOLEAN NOT NULL DEFAULT false` (`01-auth.md`).

**Curador** = usuario con `esAdmin` o `esTester`.

## Reglas de negocio

### Búsqueda web (solo curadores)

- Fuente: [Openverse](https://api.openverse.org) (sin API key), filtrando
  `license=cc0,pdm` (dominio público: sin derechos ni atribución obligatoria),
  `extension=jpg,png`. El cliente queda aislado en `buscador-web.ts` para poder
  sumar otras fuentes.
- La consulta se traduce al inglés con un diccionario es→en de productos y rubros
  comunes, palabra por palabra ("tomate perita" → "tomato"). Las palabras de
  medida o envase ("1kg", "500ml", "(kg)", "unidad", "docena") se descartan. Si
  ninguna palabra está en el diccionario, se busca el texto tal cual.
- Se descartan resultados de menos de 600 px de ancho o sin URL. Orden: primero
  los de proporción apaisada o cuadrada (entre 1:1 y 16:9), después por ancho
  descendente. Máximo 20 resultados.
- Si Openverse falla, no responde en 10 s o no hay red:
  `502 FUENTE_EXTERNA_NO_DISPONIBLE`.
- Una foto web **nunca se sirve desde la URL externa**: aprobarla la descarga (timeout
  15 s), la valida con `validarImagen` (`08-archivos.md`) y la sube al bucket.

### Aprobar y subir

- **Aprobar una foto web** (curador): crea la foto con `fuente = web`,
  `estado = aprobada`, `licencia`/`autor`/`titulo`/`origen_url` de la fuente y las
  etiquetas indicadas (normalizadas). Idempotente por `origen_url`: si ya estaba,
  devuelve la existente (agregando las etiquetas nuevas y, si estaba `pendiente` o
  `rechazada`, pasándola a `aprobada`).
- **Subir una foto propia** (`fuente = subida`, `licencia = propia`):
  - un curador → entra `aprobada`;
  - un vendedor `premium` → entra `pendiente` (la ve solo él) hasta que un curador
    la apruebe;
  - un vendedor `free` o un usuario sin tienda → `403 FOTOS_SOLO_PREMIUM`.
- **Revisar** (curador): `estado` → `aprobada` | `rechazada`, y/o reemplazar
  `etiquetas`. Registra `revisada_por_id` y `revisada_en`.
- Etiquetas: se normalizan a minúsculas sin tildes, sin repetidas, 1–40 caracteres
  cada una, máximo 20. Al aprobar o subir hace falta al menos una
  (`ETIQUETAS_INVALIDAS`).

### Quién ve qué (`fuentesVisibles`)

| Usuario            | Web (Openverse)   | Banco curado (`web` aprobada) | Subidas aprobadas | Subidas propias      |
| ------------------ | ----------------- | ----------------------------- | ----------------- | -------------------- |
| Curador            | ✔ busca y aprueba | ✔ (+ pendientes y rechazadas) | ✔                 | ✔                    |
| Vendedor `premium` | –                 | ✔                             | ✔                 | ✔ (cualquier estado) |
| Resto (free, sin tienda) | –           | ✔                             | –                 | –                    |

Los curadores ven también las fotos pendientes y rechazadas (para revisarlas).

### Búsqueda en el banco

- Texto normalizado (minúsculas, sin tildes). Coincide si alguna etiqueta o el
  título contiene alguna palabra significativa de la consulta (mismas palabras
  descartadas que en la web). Además se prueba la palabra en singular ("tomates" →
  "tomate").
- Orden: cantidad de palabras que coinciden (desc), luego `creada_en` desc. Paginado.
- `q` vacío: devuelve lo visible sin filtrar (para explorar el banco).

### Usar una foto

`usarFoto(usuario, fotoId, destino)`: la foto tiene que ser visible para el usuario
(si no, `404 FOTO_NO_ENCONTRADA`, para no revelar que existe).

- `destino = { catalogoId }`: asigna `productos_catalogo.imagen_url`. Permisos:
  - admin: siempre (puede reemplazar);
  - tester o cualquier vendedor (free o premium): solo si la entrada todavía no
    tiene foto (`409 CATALOGO_YA_TIENE_FOTO`). Un vendedor free **puede** usar
    fotos del banco para el catálogo: no es subir una foto propia. Un usuario que
    no es curador ni vendedor → `403 FORBIDDEN`.
  - Otorga `foto_cargada` al vendedor (`12-gamificacion.md`), no al admin.
- `destino = { productoId }`: asigna `productos.imagen_url` (foto personalizada) —
  solo el dueño de la tienda (`NO_ES_DUENO_DE_TIENDA`) y con plan `premium`
  (`403 FOTOS_SOLO_PREMIUM`), igual que en `03-productos.md`.

### Seed

El seed usa las mismas funciones: para cada producto del catálogo busca en el banco
(`mejorFotoDelBanco`, con la visibilidad de un curador pero solo fotos `aprobada`) y
usa la mejor; si no hay, el producto queda **sin foto** (la UI muestra el ícono de
siempre). Con `SEED_FOTOS_WEB=1` además busca en la web y crea como `pendiente` la
primera foto de cada producto que no tenga ninguna, para que un curador la revise.
El seed nunca borra `fotos_banco`.

## Endpoints REST

### `GET /api/fotos/banco?q=&page&pageSize`

Requiere sesión. Paginado. Response `200`: `{ data: FotoBanco[]; page; pageSize; total }`.

### `GET /api/fotos/web?q=`

Solo curadores. Response `200`: `{ data: ResultadoWeb[] }`.

### `POST /api/fotos/banco`

- JSON `{ resultado: ResultadoWeb; etiquetas: string[] }` → aprobar foto web
  (curador). Response `201`: `{ data: FotoBanco }`.
- `multipart/form-data` con `archivo` y `etiquetas` (separadas por coma) → subir
  foto propia. Response `201`: `{ data: FotoBanco }`.

### `PATCH /api/fotos/banco/:id`

Curador. Request `{ estado?: 'aprobada' | 'rechazada'; etiquetas?: string[] }`.
Response `200`: `{ data: FotoBanco }`.

### `POST /api/fotos/banco/:id/usar`

Request `{ catalogoId: string } | { productoId: string }`. Response `200`:
`{ data: { imagenUrl: string } }`.

### `PATCH /api/admin/usuarios/:id`

Admin. Request `{ esTester: boolean }`. Response `200`: `{ data: UsuarioAdmin }`
(`11-admin.md`).

## Firmas de funciones/clases TypeScript

Ubicación: `src/lib/fotos/`.

```ts
// buscador-web.ts
interface ResultadoWeb {
  origenUrl: string;     // página de la fuente (clave de idempotencia)
  imagenUrl: string;     // URL directa de la imagen
  miniaturaUrl: string;
  ancho: number; alto: number;
  titulo: string | null; autor: string | null;
  licencia: "cc0" | "pdm";
}
function palabrasClave(texto: string): string[];     // pura: normaliza y descarta medidas
function consultaWeb(texto: string): string;         // pura: traduce es→en
function normalizarResultados(json: unknown): ResultadoWeb[]; // pura: filtra y ordena
async function buscarWeb(texto: string, opciones?: { fetch?: typeof fetch }): Promise<ResultadoWeb[]>;

// banco.ts
interface FotoBanco {
  id: string; url: string; fuente: "web" | "subida";
  estado: "pendiente" | "aprobada" | "rechazada";
  etiquetas: string[]; titulo: string | null; autor: string | null; licencia: string | null;
  origenUrl: string | null; subidaPorId: string | null; creadaEn: string;
}
type Fuente = "web" | "curado" | "subidas" | "propias";
function esCurador(usuario: Usuario): boolean;
function fuentesVisibles(usuario: Usuario, plan: Plan | null): Fuente[]; // pura
function normalizarEtiquetas(etiquetas: unknown): string[];           // pura
async function buscarEnBanco(usuario: Usuario, q: string, paginacion): Promise<Paginado<FotoBanco>>;
async function mejorFotoDelBanco(texto: string): Promise<FotoBanco | null>;
async function aprobarFotoWeb(curador: Usuario, resultado: ResultadoWeb, etiquetas: string[], opciones?: { fetch?: typeof fetch; estado?: 'aprobada' | 'pendiente' }): Promise<FotoBanco>;
async function subirFotoBanco(usuario: Usuario, archivo: { contentType: string; buffer: Buffer }, etiquetas: string[]): Promise<FotoBanco>;
async function revisarFoto(curador: Usuario, fotoId: string, cambios: { estado?: 'aprobada' | 'rechazada'; etiquetas?: string[] }): Promise<FotoBanco>;
async function usarFoto(usuario: Usuario, fotoId: string, destino: { catalogoId: string } | { productoId: string }): Promise<{ imagenUrl: string }>;
```

## Casos de error a contemplar

| Código                          | Cuándo                                                                 |
| ------------------------------- | ---------------------------------------------------------------------- |
| `SOLO_CURADORES`                | Búsqueda web, aprobar o revisar sin ser admin ni tester (`403`).       |
| `FOTO_NO_ENCONTRADA`            | La foto no existe o no es visible para el usuario (`404`).             |
| `FUENTE_EXTERNA_NO_DISPONIBLE`  | Openverse falla, no responde o no hay red (`502`).                     |
| `FOTO_INVALIDA`                 | La descarga falla o no es una imagen JPEG/PNG/WEBP de hasta 5 MB (`400`). |
| `ETIQUETAS_INVALIDAS`           | Sin etiquetas, o alguna vacía / de más de 40 caracteres, o más de 20 (`400`). |
| `DESTINO_INVALIDO`              | `usar` sin `catalogoId` ni `productoId` (`400`).                       |
| `ESTADO_FOTO_INVALIDO`          | `estado` distinto de `aprobada`/`rechazada` (`400`).                   |
| `FOTOS_SOLO_PREMIUM`            | Subir foto propia sin ser premium ni curador; usar foto en `productoId` sin premium (`403`). |
| `CATALOGO_YA_TIENE_FOTO`        | Un no-admin usa una foto en un catálogo que ya tiene (`409`).          |
