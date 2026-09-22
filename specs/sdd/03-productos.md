# Módulo: productos

Convenciones comunes: ver [`00-overview.md`](00-overview.md). Depende de
[`02-tiendas.md`](02-tiendas.md).

## Modelo de datos

```sql
CREATE TABLE productos (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tienda_id      UUID NOT NULL REFERENCES tiendas(id),
  nombre         TEXT NOT NULL,
  descripcion    TEXT,
  precio         NUMERIC(12, 2) NOT NULL,
  stock          INTEGER NOT NULL DEFAULT 0,
  disponible     BOOLEAN NOT NULL DEFAULT true,
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT precio_no_negativo CHECK (precio >= 0),
  CONSTRAINT stock_no_negativo CHECK (stock >= 0)
);

CREATE INDEX productos_tienda_id_idx ON productos (tienda_id);
```

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

## Endpoints REST

### `POST /api/tiendas/:tiendaId/productos`

Requiere ser el dueño de la tienda (`tiendaId`).

Request:

```ts
{ nombre: string; descripcion?: string; precio: number; stock: number }
```

Response `201`: `{ data: Producto }`. `disponible` nace en `true`.

### `GET /api/tiendas/:tiendaId/productos`

Público. Query opcional `?soloDisponibles=true` (para el catálogo del comprador,
filtra por la regla de "comprable" de arriba; sin el query param devuelve todo,
para el panel de gestión del vendedor). Paginado (ver `00-overview.md`).

Response `200`: `{ data: Producto[]; page; pageSize; total }`.

### `PATCH /api/productos/:id`

Requiere ser el dueño de la tienda del producto.

Request (todos opcionales): `{ nombre?; descripcion?; precio?; stock?; disponible? }`.

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
  nombre: string;
  descripcion: string | null;
  precio: number;
  stock: number;
  disponible: boolean;
}

function esComprable(producto: Producto): boolean; // disponible && stock > 0

interface CrearProductoInput {
  nombre: string;
  descripcion?: string;
  precio: number;
  stock: number;
}

async function crearProducto(
  vendedor: Usuario,
  tiendaId: string,
  input: CrearProductoInput
): Promise<Producto>;

interface ListarProductosInput {
  tiendaId: string;
  soloDisponibles?: boolean;
  page?: number;
  pageSize?: number;
}

async function listarProductos(
  input: ListarProductosInput
): Promise<{ data: Producto[]; page: number; pageSize: number; total: number }>;

interface ActualizarProductoInput {
  nombre?: string;
  descripcion?: string;
  precio?: number;
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
