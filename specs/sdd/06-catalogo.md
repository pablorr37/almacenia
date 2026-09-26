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
  categoria     categoria,
  codigo_barras TEXT UNIQUE,
  imagen_url    TEXT,
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX productos_catalogo_nombre_idx ON productos_catalogo (nombre);
```

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
  Un vendedor `free` nunca sube fotos (`403 FOTOS_SOLO_PREMIUM`). Asignar la foto de
  catálogo otorga `foto_cargada` al vendedor (`12-gamificacion.md`); al admin no.
- Editar una entrada de catálogo (nombre/marca) está fuera del
  MVP — cada tienda ajusta su copia denormalizada en `Producto` (`03-productos.md`)
  sin tocar la entrada compartida.

## Endpoints REST

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
  categoria: Categoria | null;
  codigoBarras: string | null;
  imagenUrl: string | null;
}

interface BuscarEnCatalogoInput {
  q?: string;
  codigoBarras?: string;
}

async function buscarEnCatalogo(input: BuscarEnCatalogoInput): Promise<ProductoCatalogo[]>;

async function obtenerProductoCatalogo(id: string): Promise<ProductoCatalogo | null>;

interface CrearProductoNuevoEnCatalogoInput {
  nombre: string;
  descripcion?: string;
  marca?: string;
  categoria?: Categoria;
  codigoBarras?: string;
  imagenUrl?: string;
}

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
| `CATALOGO_YA_TIENE_FOTO`       | Un vendedor premium (no admin) intenta reemplazar una foto de catálogo existente (`409`). |
| `FOTOS_SOLO_PREMIUM`           | Un vendedor `free` (o un usuario sin tienda que no es admin) intenta asignar foto de catálogo (`403`). |
| `CATALOGO_NO_ENCONTRADO`       | `obtenerProductoCatalogo`/`adoptarProductoDeCatalogo` con `id` inexistente (usado desde `03-productos.md`). |
