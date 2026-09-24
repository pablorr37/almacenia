# Módulo: productos

Convenciones comunes: ver [`00-overview.md`](00-overview.md). Depende de
[`02-tiendas.md`](02-tiendas.md) y [`06-catalogo.md`](06-catalogo.md) (catálogo
compartido de productos entre vendedores).

## Modelo de datos

```sql
CREATE TABLE productos (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tienda_id      UUID NOT NULL REFERENCES tiendas(id),
  catalogo_id    UUID NOT NULL REFERENCES productos_catalogo(id),
  nombre         TEXT NOT NULL,
  descripcion    TEXT,
  categoria      categoria,
  imagen_url     TEXT,
  precio         NUMERIC(12, 2) NOT NULL,
  precio_oferta  NUMERIC(12, 2),
  destacado      BOOLEAN NOT NULL DEFAULT false,
  stock          INTEGER NOT NULL DEFAULT 0,
  disponible     BOOLEAN NOT NULL DEFAULT true,
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT precio_no_negativo CHECK (precio >= 0),
  CONSTRAINT precio_oferta_no_negativo CHECK (precio_oferta IS NULL OR precio_oferta >= 0),
  CONSTRAINT precio_oferta_menor CHECK (precio_oferta IS NULL OR precio_oferta < precio),
  CONSTRAINT stock_no_negativo CHECK (stock >= 0)
);

CREATE INDEX productos_tienda_id_idx ON productos (tienda_id);
CREATE INDEX productos_catalogo_id_idx ON productos (catalogo_id);
CREATE INDEX productos_categoria_idx ON productos (categoria);
```

- `nombre`, `descripcion`, `imagen_url` y `categoria` nacen copiados del
  `ProductoCatalogo` elegido al crear el producto (denormalizados para no pagar un
  join en cada listado del storefront) pero son editables por tienda después — cada
  vendedor puede ajustar su propia descripción o foto sin afectar el catálogo
  compartido ni a otras tiendas que adoptaron el mismo `catalogoId`. `precio` nunca
  viene del catálogo: es siempre propio de cada tienda (ver `06-catalogo.md`).
- `precio_oferta`, cuando no es `null`, es el precio promocional vigente — debe ser
  menor a `precio`. Un producto "en oferta" (tab de storefront) es el que tiene
  `precio_oferta` no nulo.
- `destacado` es un flag manual que el vendedor prende/apaga por producto (`PATCH`),
  independiente del plan de la tienda — alimenta el tab "destacados" del storefront
  de esa tienda. No tiene relación con `Tienda.plan`/`destacado_prioritario`
  (`10-planes.md`), que es sobre *entre qué tiendas* aparece una destacada primero
  en listados que cruzan varias tiendas (fuera del alcance de este endpoint, que
  siempre lista productos de una sola tienda).

- `stock` es la fuente de verdad de unidades disponibles; lo debita el módulo
  `ventas` (ver `05-ventas.md`), nunca se edita directamente desde `productos` salvo
  ajuste manual del vendedor (`PATCH`, ver más abajo).
- `disponible` es un flag manual e independiente de `stock`: un vendedor puede tener
  `stock > 0` pero pausar la publicación (`disponible = false`, ej. producto de
  temporada) sin perder el conteo. Un producto con `stock = 0` se considera no
  comprable aunque `disponible = true` (ver reglas).

## Reglas de negocio

- Solo el `vendedor_id` dueño de la `tienda_id` puede crear/editar/eliminar productos
  de esa tienda.
- Un producto es **comprable** (aparece como agregable a pedido o venta) solo si
  `disponible = true` **y** `stock > 0`. Esta es una regla derivada, no un campo
  propio — se calcula en el momento de mostrar el catálogo o validar un pedido/venta.
- `precio` es un monto en la moneda local, sin decimales de más de 2 posiciones.
- No hay borrado físico de productos con historial de ventas asociado: `DELETE`
  marca `disponible = false` y `stock = 0` en lugar de borrar la fila, para no romper
  la referencia desde `ItemVenta`/`ItemPedido` de ventas pasadas.
- Crear un producto requiere elegir un `catalogoId` existente o proveer los datos de
  un producto nuevo para darlo de alta en el catálogo compartido de una — ver el
  flujo completo (buscar/adoptar/crear) en `06-catalogo.md`. `POST` acepta
  cualquiera de las dos formas de input (ver Endpoints).
- Ordenar por "más vendidos" se calcula agregando `SUM(cantidad)` de `ItemVenta`
  agrupado por `producto_id` (ver `05-ventas.md`) — no es una columna propia, para
  no mantener un contador desincronizado del historial real.
- Ordenar por "valoración" usa el promedio de `Resena` del producto (ver
  `07-resenas.md`), también calculado por query, no una columna.

## Endpoints REST

### `POST /api/tiendas/:tiendaId/productos`

Requiere ser el dueño de la tienda (`tiendaId`).

Request — a partir de un producto ya existente en el catálogo compartido:

```ts
{ catalogoId: string; precio: number; stock: number; imagenUrl?: string; descripcion?: string }
```

o dando de alta un producto nuevo en el catálogo compartido en la misma operación:

```ts
{
  nuevo: { nombre: string; marca?: string; codigoBarras?: string; categoria?: Categoria; imagenUrl?: string };
  precio: number;
  stock: number;
  descripcion?: string;
}
```

Response `201`: `{ data: Producto }`. `disponible` nace en `true`.

### `GET /api/tiendas/:tiendaId/productos`

Público. Query params opcionales:
- `soloDisponibles=true` (para el catálogo del comprador, filtra por la regla de
  "comprable" de arriba; sin el query param devuelve todo, para el panel de gestión
  del vendedor).
- `categoria=<Categoria>`, `q=<texto>` (busca en `nombre`/`descripcion`),
  `precioMin=<number>`, `precioMax=<number>`.
- `tab=ofertas|nuevos|destacados` — `ofertas` filtra `precioOferta IS NOT NULL`;
  `nuevos` ordena por `creadoEn desc`; `destacados` filtra `destacado = true`
  (flag manual del vendedor, ver modelo de datos).
- `sort=precio_asc|precio_desc|alfabetico|mas_vendidos|rating` (default: `creadoEn desc`).

Paginado (ver `00-overview.md`).

Response `200`: `{ data: Producto[]; page; pageSize; total }`.

### `PATCH /api/productos/:id`

Requiere ser el dueño de la tienda del producto.

Request (todos opcionales):
`{ nombre?; descripcion?; imagenUrl?; precio?; precioOferta?; destacado?; stock?; disponible? }`.
`categoria` y `catalogoId` no son editables por `PATCH` — están atados al producto
de catálogo elegido al crear (ver `06-catalogo.md` si el catálogo mismo necesita
corrección).

Response `200`: `{ data: Producto }`.

### `DELETE /api/productos/:id`

Requiere ser el dueño de la tienda del producto. Ver regla de borrado
lógico arriba. Response `200`: `{ data: Producto }` (con `disponible: false, stock: 0`).

## Firmas de funciones/clases TypeScript

Ubicación: `src/lib/productos/`.

```ts
interface Producto {
  id: string;
  tiendaId: string;
  catalogoId: string;
  nombre: string;
  descripcion: string | null;
  categoria: Categoria | null;
  imagenUrl: string | null;
  precio: number;
  precioOferta: number | null;
  destacado: boolean;
  stock: number;
  disponible: boolean;
}

function esComprable(producto: Producto): boolean; // disponible && stock > 0

type CrearProductoInput =
  | { catalogoId: string; precio: number; stock: number; imagenUrl?: string; descripcion?: string }
  | {
      nuevo: { nombre: string; marca?: string; codigoBarras?: string; categoria?: Categoria; imagenUrl?: string };
      precio: number;
      stock: number;
      descripcion?: string;
    };

async function crearProducto(
  vendedor: Usuario,
  tiendaId: string,
  input: CrearProductoInput
): Promise<Producto>;

interface ListarProductosInput {
  tiendaId: string;
  soloDisponibles?: boolean;
  categoria?: Categoria;
  q?: string;
  precioMin?: number;
  precioMax?: number;
  tab?: 'ofertas' | 'nuevos' | 'destacados';
  sort?: 'precio_asc' | 'precio_desc' | 'alfabetico' | 'mas_vendidos' | 'rating';
  page?: number;
  pageSize?: number;
}

async function listarProductos(
  input: ListarProductosInput
): Promise<{ data: Producto[]; page: number; pageSize: number; total: number }>;

interface ActualizarProductoInput {
  nombre?: string;
  descripcion?: string;
  imagenUrl?: string;
  precio?: number;
  precioOferta?: number | null;
  destacado?: boolean;
  stock?: number;
  disponible?: boolean;
}

async function actualizarProducto(
  vendedor: Usuario,
  productoId: string,
  input: ActualizarProductoInput
): Promise<Producto>;

async function eliminarProducto(vendedor: Usuario, productoId: string): Promise<Producto>;

// Usada internamente por el módulo `ventas` (05-ventas.md) para debitar stock
// de forma atómica; no se expone como endpoint propio.
async function debitarStock(productoId: string, cantidad: number): Promise<Producto>;
```

## Casos de error a contemplar

| Código                     | Cuándo                                                           |
| --------------------------- | ------------------------------------------------------------------|
| `TIENDA_NO_ENCONTRADA`      | `tiendaId` no existe al crear/listar productos.                  |
| `NO_ES_DUENO_DE_TIENDA`     | El usuario autenticado no es dueño de la tienda del producto.    |
| `PRODUCTO_NO_ENCONTRADO`    | `:id` no existe.                                                  |
| `PRECIO_INVALIDO`           | `precio < 0`.                                                     |
| `STOCK_INVALIDO`            | `stock < 0` (en creación o edición manual).                      |
| `STOCK_INSUFICIENTE`        | `debitarStock` pide debitar más de lo disponible (usado por `ventas`). |
| `PRECIO_OFERTA_INVALIDO`    | `precioOferta` negativo o mayor/igual a `precio`.                  |
| `CATALOGO_NO_ENCONTRADO`    | `catalogoId` no existe (ver `06-catalogo.md`).                     |
