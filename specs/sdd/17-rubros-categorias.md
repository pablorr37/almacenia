# Módulo: rubros de negocio y categorías de producto

Convenciones comunes: ver [`00-overview.md`](00-overview.md). Lo consumen
[`02-tiendas.md`](02-tiendas.md) (rubro de la tienda), [`06-catalogo.md`](06-catalogo.md)
y [`03-productos.md`](03-productos.md) (categoría del producto). Reemplaza al enum fijo
`categoria` que antes compartían tiendas y productos.

## Modelo de datos

```sql
CREATE TABLE rubros (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre             TEXT NOT NULL,
  nombre_normalizado TEXT NOT NULL UNIQUE, -- minúsculas, sin tildes ni espacios de más
  orden              INTEGER NOT NULL DEFAULT 0,
  creado_en          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE categorias_producto (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre             TEXT NOT NULL,
  nombre_normalizado TEXT NOT NULL UNIQUE,
  creada_en          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE tiendas ADD COLUMN rubro_id UUID REFERENCES rubros(id);            -- reemplaza tiendas.rubro
ALTER TABLE productos_catalogo ADD COLUMN categoria_id UUID NOT NULL REFERENCES categorias_producto(id);
ALTER TABLE productos ADD COLUMN categoria_id UUID REFERENCES categorias_producto(id); -- copia denormalizada
```

- **Rubro**: tipo de negocio (Almacén, Kiosco, Verdulería, Vivero…). Una tienda tiene
  0 o 1 rubro. Es informativo (perfil, admin); no limita qué categorías vende.
- **Categoría de producto**: el "qué es" genérico de un producto (Arroz, Gaseosa,
  Queso, Plantas de interior). Lista **única**, sin vínculo con los rubros. Cada
  entrada del catálogo compartido pertenece a exactamente una categoría; el vendedor
  le agrega marca, variante y contenido (`06-catalogo.md`).
- Los **rubros** los mantiene **solo el admin**. Las **categorías** las mantiene el
  admin, y además las pueden **crear** los usuarios con plan **premium o mayor** (ver
  "Categorías creadas por usuarios"). Todos los usuarios (incluso sin sesión) pueden
  leer los dos listados.

## Reglas de negocio

- `nombre`: 2–40 caracteres después de `trim`, colapsando espacios; pasa por el filtro
  de groserías (`TEXTO_NO_PERMITIDO`, `src/lib/moderacion`).
- Unicidad por `nombre_normalizado` (minúsculas, sin tildes, espacios simples): "Arroz"
  y "arróz " son el mismo → `409 NOMBRE_DUPLICADO`.
- Renombrar respeta las mismas reglas. Las entradas de catálogo ya creadas **no**
  cambian su `nombre` compuesto al renombrar la categoría (es identidad histórica);
  sí muestran el nombre nuevo de la categoría donde se lista la categoría.
- Borrar un rubro usado por alguna tienda → `409 RUBRO_EN_USO`. Borrar una categoría
  usada por alguna entrada de catálogo → `409 CATEGORIA_EN_USO`.
- Listado de rubros: por `orden` y después `nombre`. Categorías: por `nombre`
  (`localeCompare` es-AR), con filtro opcional `q` (contiene, sin distinguir tildes ni
  mayúsculas).
- Rubros iniciales (los crea la migración que reemplaza el enum, para que las tiendas
  existentes conserven el suyo): Almacén, Bebidas, Lácteos, Panadería, Limpieza,
  Kiosco, Verdulería, Fiambrería, Vivero, Otros. Las categorías arrancan vacías: las
  carga el admin.

### Categorías creadas por usuarios (premium o mayor)

- Al dar de alta un producto nuevo del catálogo, en lugar de `categoriaId` se puede
  mandar `categoriaNueva: string` (el nombre escrito):
  - en el alta de producto de una tienda (`03-productos.md`, `nuevo.categoriaNueva`);
  - en "Agregar al catálogo" desde una lista (`06-catalogo.md`, `POST /api/catalogo`).
- Se exige plan **premium o mayor** (feature `crear_categorias`, `10-planes.md`):
  - en una tienda, alcanza con que el plan de la **tienda** (el de su dueño) o el
    del **usuario** que carga sea premium o mayor;
  - desde una lista, el plan del usuario.
  - Si no, `403 PLAN_INSUFICIENTE`.
- Si ya existe una categoría con ese nombre normalizado, **se usa esa** (no hay error
  de duplicado: el usuario la escribió porque no la encontró, por ejemplo con otra
  tilde).
- El nombre pasa por las mismas validaciones (2–40 caracteres, filtro de groserías).
- La categoría nueva se crea **en la misma operación** que el producto: si el alta del
  producto falla, no queda una categoría suelta.
- Se guarda quién la creó (`categorias_producto.creada_por_id`, nullable); el admin
  puede renombrarla o borrarla como cualquier otra.

## Endpoints REST

### `GET /api/rubros` · `GET /api/categorias`

Públicos. `GET /api/categorias?q=<texto>` filtra. Response `200`:
`{ data: Rubro[] }` / `{ data: CategoriaProducto[] }` (sin paginar: son listas cortas).

### `POST /api/admin/rubros` · `POST /api/admin/categorias`

Admin. Request: `{ nombre: string; orden?: number }` (`orden` solo en rubros).
Response `201`: `{ data: Rubro | CategoriaProducto }`.

### `PATCH /api/admin/rubros/:id` · `PATCH /api/admin/categorias/:id`

Admin. Request: `{ nombre?: string; orden?: number }`. Response `200`.
`404 RUBRO_NO_ENCONTRADO` / `404 CATEGORIA_NO_ENCONTRADA`.

### `DELETE /api/admin/rubros/:id` · `DELETE /api/admin/categorias/:id`

Admin. Response `200`: `{ data: { id } }`. `409 RUBRO_EN_USO` / `409 CATEGORIA_EN_USO`.

## Firmas de funciones/clases TypeScript

Ubicación: `src/lib/rubros-categorias/`.

```ts
interface Rubro { id: string; nombre: string; orden: number }
interface CategoriaProducto { id: string; nombre: string }

function normalizarNombre(texto: string): string; // pura: minúsculas, sin tildes, espacios simples

async function listarRubros(): Promise<Rubro[]>;
async function crearRubro(admin: Usuario, input: { nombre: string; orden?: number }): Promise<Rubro>;
async function actualizarRubro(admin: Usuario, id: string, input: { nombre?: string; orden?: number }): Promise<Rubro>;
async function eliminarRubro(admin: Usuario, id: string): Promise<void>;

async function listarCategorias(q?: string): Promise<CategoriaProducto[]>;
async function crearCategoria(admin: Usuario, input: { nombre: string }): Promise<CategoriaProducto>;
async function actualizarCategoria(admin: Usuario, id: string, input: { nombre?: string }): Promise<CategoriaProducto>;
async function eliminarCategoria(admin: Usuario, id: string): Promise<void>;
```

## Códigos de error

| Código                    | HTTP | Cuándo |
| ------------------------- | ---- | ------ |
| `NOMBRE_INVALIDO`         | 400  | Nombre vacío, de menos de 2 o más de 40 caracteres. |
| `TEXTO_NO_PERMITIDO`      | 400  | El nombre tiene palabras no permitidas. |
| `NOMBRE_DUPLICADO`        | 409  | Ya existe uno con el mismo nombre normalizado. |
| `RUBRO_NO_ENCONTRADO`     | 404  | El rubro no existe (admin, o `rubroId` inválido en tiendas). |
| `CATEGORIA_NO_ENCONTRADA` | 404  | La categoría no existe (admin, o `categoriaId` inválido en catálogo). |
| `RUBRO_EN_USO`            | 409  | Hay tiendas con ese rubro. |
| `CATEGORIA_EN_USO`        | 409  | Hay entradas de catálogo con esa categoría. |
| `FORBIDDEN`               | 403  | Escritura sin ser admin (endpoints `/api/admin/...`). |
| `PLAN_INSUFICIENTE`       | 403  | Crear una categoría (`categoriaNueva`) sin plan premium o mayor. |
