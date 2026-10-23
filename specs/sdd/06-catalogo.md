# Módulo: catálogo (productos_catalogo)

Convenciones comunes: ver [`00-overview.md`](00-overview.md). Es consumido por
[`03-productos.md`](03-productos.md).

## Modelo de datos

```sql
CREATE TABLE productos_catalogo (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre        TEXT NOT NULL,
  descripcion   TEXT,
  marca         TEXT,
  categoria_id  UUID NOT NULL REFERENCES categorias_producto(id), -- 17-rubros-categorias.md
  variante      TEXT,           -- ej. "largo fino", "sabor naranja", "sin TACC"
  contenido     NUMERIC(10, 3), -- tamaño del envase; NULL en productos sueltos por kg
  unidad_contenido unidad_contenido, -- 'g' | 'kg' | 'ml' | 'l' | 'u'
  codigo_barras TEXT UNIQUE,
  imagen_url    TEXT,
  unidad        unidad_medida NOT NULL DEFAULT 'unidad', -- 'unidad' | 'kg' 
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX productos_catalogo_nombre_idx ON productos_catalogo (nombre);
CREATE TYPE unidad_contenido AS ENUM ('g', 'kg', 'ml', 'l', 'u');
```

**Identidad de una entrada = categoría + marca + variante + contenido.** La categoría
la elige el usuario de la lista que mantiene el admin (`17-rubros-categorias.md`); el
resto lo completa él. `nombre` ya no se tipea: se **compone**
(`componerNombreCatalogo`, pura) uniendo con espacios, en este orden, los que haya:
nombre de la categoría, marca, variante y contenido formateado
(`1 kg`, `500 g`, `1,5 l`, `6 u`). Ej.: Arroz + Gallo Oro + largo fino + 1 kg →
"Arroz Gallo Oro largo fino 1 kg"; Queso (suelto, por kg) + "cremoso" → "Queso cremoso".

`unidad` dice cómo se vende el producto en **todas** las tiendas (es identidad del
producto, no decisión de cada tienda): `'unidad'` (se cuenta: 1, 2, 3…) o `'kg'`
(se pesa: fiambre, queso, verdura suelta, pan; precio por kg y cantidades con
fracción). Ver "Cantidades y unidades" en `03-productos.md`.

`productos_catalogo` es una entidad **global, compartida entre todos los
vendedores** — no pertenece a ninguna tienda. Guarda la identidad de un producto
(nombre, marca, código de barras, categoría, foto de referencia) pero **nunca
precio ni stock**: eso es siempre propio de cada `Producto` por tienda (ver
`03-productos.md`).

## Reglas de negocio

- Cualquier usuario autenticado (vendedor **o comprador**) puede buscar en el
  catálogo compartido (no hace falta ser dueño de ninguna fila para leerla). Los
  compradores lo usan para armar listas de compras (`14-listas-compras.md`).
- `codigoBarras`, cuando se informa, es único en todo el catálogo — no puede haber
  dos entradas con el mismo código. Es opcional (hay productos sin código de barras
  legible, ej. productos sueltos de verdulería).
- **Datos de una entrada nueva** (`NuevaEntradaCatalogo`): `categoriaId` obligatorio
  (`404 CATEGORIA_NO_ENCONTRADA`) — o, para usuarios premium o mayor, `categoriaNueva`
  con el nombre de una categoría que se crea en el momento (`17-rubros-categorias.md`) —, `marca?` y `variante?` (≤ 40 caracteres cada una,
  filtro de groserías), `contenido?` > 0 con `unidadContenido` obligatoria si hay
  contenido (`400 CONTENIDO_INVALIDO`), `unidad` de venta (`'unidad'` | `'kg'`) y
  `codigoBarras?`. Un producto por kg (suelto) no lleva contenido
  (`CONTENIDO_INVALIDO` si se manda).
- **Sin duplicados**: si ya existe una entrada con la misma categoría, unidad de venta,
  contenido y unidad de contenido, y la misma marca y variante normalizadas (sin
  tildes, mayúsculas ni espacios de más), se reutiliza esa en vez de crear otra — tanto
  en el alta del vendedor como en la del comprador.
- Al cargar un producto nuevo en una tienda (`crearProducto`, `03-productos.md`), el
  vendedor primero busca en el catálogo por nombre o código de barras
  (`buscarEnCatalogo`). Si encuentra una coincidencia, **adopta** esa entrada
  (`adoptarProductoDeCatalogo`): se crea el `Producto` de su tienda apuntando a ese
  `catalogoId`, sin duplicar la carga de nombre/marca/categoría. Si no hay
  coincidencia, se crea una entrada nueva en `productos_catalogo`
  (`crearProductoNuevoEnCatalogo`) y el `Producto` de la tienda apunta a ella — así
  queda disponible para que otros vendedores la adopten después.
- Una entrada de catálogo no se borra nunca desde este módulo (no hay `DELETE`): si
  ningún `Producto` la referencia más, simplemente queda sin uso; no afecta a otras
  tiendas.
- **Foto del catálogo.** `imagen_url` es la foto del producto, compartida por todas
  las tiendas que lo venden (ver regla de fotos en `03-productos.md`). Puede
  asignarla:
  - un vendedor cuya tienda sea `premium`, **solo si la entrada todavía no tiene
    foto** (`409 CATALOGO_YA_TIENE_FOTO` si ya tiene);
  - un admin (`esAdmin`), siempre, incluso reemplazando una foto existente.
  Un vendedor `free` nunca sube fotos (`403 FOTOS_SOLO_PREMIUM`), pero **sí puede
  elegir una foto del banco curado** para una entrada sin foto
  (`POST /api/fotos/banco/:id/usar`, `16-banco-fotos.md`); los testers también.
  Asignar la foto de catálogo otorga `foto_cargada` al vendedor
  (`12-gamificacion.md`); al admin no.
- Editar una entrada de catálogo (nombre/marca) está fuera del
  MVP — cada tienda ajusta su copia denormalizada en `Producto` (`03-productos.md`)
  sin tocar la entrada compartida.

- **Alta desde una lista de compras** (`14-listas-compras.md`): cualquier usuario
  autenticado puede sumar al catálogo compartido un producto que no encuentra.
  - Campos: los de `NuevaEntradaCatalogo` (categoría obligatoria, marca, variante,
    contenido, unidad de venta).
  - Si ya existe la misma entrada (regla "Sin duplicados"), se devuelve esa.
  - Filtro de groserías en marca y variante (`TEXTO_NO_PERMITIDO`, `src/lib/moderacion`).
  - Máximo 20 altas por usuario por día (`LIMITE_ALTAS_CATALOGO`).
  - Se guarda `creado_por_id` (columna nueva, `ON DELETE SET NULL`) para que el
    admin pueda revisar y borrar las entradas sin uso cargadas por compradores.

## Endpoints REST

### `POST /api/catalogo`

Requiere sesión. Request: `NuevaEntradaCatalogo` (sin `codigoBarras`).
Response `201`: `{ data: ProductoCatalogo; creado: boolean }` (`creado: false` si ya
existía y se devolvió esa).

### `GET /api/catalogo/buscar`

Requiere sesión válida (cualquier usuario autenticado).

Query: `?q=<texto>` (busca en `nombre`, case-insensitive, parcial) o
`?codigoBarras=<texto>` (match exacto) — al menos uno de los dos.

Response `200`: `{ data: ProductoCatalogo[] }` (hasta 20 resultados, sin
paginación estándar por ser un autocompletar).

### `PATCH /api/catalogo/:id/foto`

Requiere sesión válida. Request: `{ imagenUrl: string }` (URL devuelta por
`POST /api/archivos/upload?tipo=catalogo`). Reglas: ver "Foto del catálogo" arriba.
Response `200`: `{ data: ProductoCatalogo }`.

## Firmas de funciones/clases TypeScript

Ubicación: `src/lib/catalogo/`.

```ts
interface ProductoCatalogo {
  id: string;
  nombre: string;
  descripcion: string | null;
  marca: string | null;
  categoria: { id: string; nombre: string };
  variante: string | null;
  contenido: number | null;
  unidadContenido: 'g' | 'kg' | 'ml' | 'l' | 'u' | null;
  unidad: 'unidad' | 'kg';
  codigoBarras: string | null;
  imagenUrl: string | null;
}

interface NuevaEntradaCatalogo {
  categoriaId: string;     // o categoriaNueva (premium o mayor, 17-rubros-categorias.md)
  categoriaNueva?: string;
  marca?: string;
  variante?: string;
  contenido?: number;
  unidadContenido?: 'g' | 'kg' | 'ml' | 'l' | 'u';
  unidad?: 'unidad' | 'kg'; // default 'unidad'
  codigoBarras?: string;
}

// Pura.
function componerNombreCatalogo(partes: {
  categoria: string; marca?: string | null; variante?: string | null;
  contenido?: number | null; unidadContenido?: string | null;
}): string;

interface BuscarEnCatalogoInput {
  q?: string;
  codigoBarras?: string;
}

async function buscarEnCatalogo(input: BuscarEnCatalogoInput): Promise<ProductoCatalogo[]>;

async function obtenerProductoCatalogo(id: string): Promise<ProductoCatalogo | null>;

type CrearProductoNuevoEnCatalogoInput = NuevaEntradaCatalogo & { descripcion?: string; imagenUrl?: string };

async function crearProductoNuevoEnCatalogo(
  input: CrearProductoNuevoEnCatalogoInput
): Promise<ProductoCatalogo>;

// Reglas de "Foto del catálogo". `usuario` debe ser admin o dueño de una tienda premium.
async function asignarFotoCatalogo(
  usuario: Usuario,
  catalogoId: string,
  imagenUrl: string
): Promise<ProductoCatalogo>;
```

## Casos de error a contemplar

| Código                        | Cuándo                                                          |
| ------------------------------ | -------------------------------------------------------------------|
| `BUSQUEDA_CATALOGO_INVALIDA`   | `buscarEnCatalogo` sin `q` ni `codigoBarras`.                    |
| `CODIGO_BARRAS_DUPLICADO`      | `crearProductoNuevoEnCatalogo` con un `codigoBarras` que ya existe. |
| `UNIDAD_INVALIDA`              | `unidad` no es `'unidad'` ni `'kg'` al crear una entrada.         |
| `CATEGORIA_NO_ENCONTRADA`      | `categoriaId` vacío o inexistente (`404`).                       |
| `CONTENIDO_INVALIDO`           | `contenido` ≤ 0, sin `unidadContenido`, o contenido en un producto por kg. |
| `TEXTO_INVALIDO`               | Marca o variante de más de 40 caracteres.                        |
| `TEXTO_NO_PERMITIDO`           | Marca o variante con palabras no permitidas.                   |
| `LIMITE_ALTAS_CATALOGO`        | El usuario ya sumó 20 productos al catálogo hoy (`429`).       |
| `CATALOGO_YA_TIENE_FOTO`       | Un vendedor premium (no admin) intenta reemplazar una foto de catálogo existente (`409`). |
| `FOTOS_SOLO_PREMIUM`           | Un vendedor `free` (o un usuario sin tienda que no es admin) intenta asignar foto de catálogo (`403`). |
| `CATALOGO_NO_ENCONTRADO`       | `obtenerProductoCatalogo`/`adoptarProductoDeCatalogo` con `id` inexistente (usado desde `03-productos.md`). |
