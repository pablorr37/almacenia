# Módulo: ventas

Convenciones comunes: ver [`00-overview.md`](00-overview.md). Depende de
[`03-productos.md`](03-productos.md) y [`04-pedidos.md`](04-pedidos.md).

La **venta** es la instancia real de la transacción: el momento en que el vendedor
cierra el trato (n productos = x dinero). Es lo que debita el `stock` de `productos` y
queda en el historial de la tienda (base para el futuro módulo de balance/reportes,
fuera de este MVP). Toda venta tiene un origen:

- **Presencial**: el vendedor la carga directamente en el momento, sin `pedido` previo
  — es un mini punto de venta interno para ventas de mostrador.
- **A distancia**: se genera automáticamente cuando un `Pedido` pasa a `entregado`
  (ver `04-pedidos.md`). No existe una forma de crear manualmente una venta "a
  distancia" — siempre nace de esa transición.

## Modelo de datos

```sql
CREATE TYPE origen_venta AS ENUM ('presencial', 'pedido');

CREATE TABLE ventas (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tienda_id    UUID NOT NULL REFERENCES tiendas(id),
  comprador_id UUID REFERENCES usuarios(id), -- null si es presencial sin comprador registrado
  pedido_id    UUID REFERENCES pedidos(id),  -- null si es presencial
  origen       origen_venta NOT NULL,
  total        NUMERIC(12, 2) NOT NULL,
  creada_en    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT total_no_negativo CHECK (total >= 0),
  CONSTRAINT pedido_id_solo_si_origen_pedido
    CHECK ((origen = 'pedido') = (pedido_id IS NOT NULL))
);

CREATE TABLE items_venta (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venta_id        UUID NOT NULL REFERENCES ventas(id),
  producto_id     UUID NOT NULL REFERENCES productos(id),
  cantidad        INTEGER NOT NULL,
  precio_unitario NUMERIC(12, 2) NOT NULL, -- precio del producto al momento de la venta
  CONSTRAINT cantidad_positiva CHECK (cantidad > 0)
);

CREATE INDEX ventas_tienda_id_idx ON ventas (tienda_id);
CREATE INDEX ventas_creada_en_idx ON ventas (creada_en); -- para reportes futuros por fecha
CREATE INDEX items_venta_venta_id_idx ON items_venta (venta_id);
```

- `pedido_id` nullable + constraint `pedido_id_solo_si_origen_pedido`: garantiza a
  nivel de base de datos que una venta `presencial` nunca tenga `pedido_id`, y una
  venta `pedido` siempre lo tenga.
- `comprador_id` es nullable porque una venta presencial puede ser a un cliente que no
  tiene cuenta en Almacenia (venta de mostrador anónima). En una venta con
  `origen = 'pedido'`, `comprador_id` siempre está presente (copiado del pedido).
- `total` y `precio_unitario` en `items_venta` se calculan/copian al momento de crear
  la venta, no se recalculan después — una venta ya cerrada es un registro histórico
  inmutable (no hay `UPDATE`/`DELETE` de ventas en el MVP).

## Reglas de negocio

- **Gamificación**: después de confirmar una venta (cualquier origen) se otorgan
  puntos al vendedor (`venta_realizada`) y, si hay `compradorId`, al comprador
  (`compra_realizada`, `visita_compra`) — ver `12-gamificacion.md`. Un error de
  gamificación nunca hace fallar la venta.

- **Débito de stock atómico**: crear una venta (por cualquier origen) y debitar el
  stock de cada producto involucrado ocurre en una única transacción de base de
  datos. Si el stock de algún producto no alcanza para la cantidad pedida, **toda**
  la operación falla (no se debita nada, no se crea la venta) con
  `STOCK_INSUFICIENTE`.
- **Origen presencial**: solo el vendedor dueño de la tienda puede crear una venta
  presencial, para productos de su propia tienda.
- **Origen a distancia**: no tiene endpoint propio de creación — es un efecto interno
  de `transicionarPedido(usuario, pedidoId, 'entregar')` (ver `04-pedidos.md`). Copia
  `tienda_id`, `comprador_id` y los `items` (con sus `precioUnitario` ya congelados)
  directamente desde el pedido.
- Las ventas son **inmutables**: no existen endpoints de edición ni borrado. Un error
  de carga en una venta presencial se corrige registrando un ajuste de stock manual
  en `productos` (`PATCH /api/productos/:id`), no editando la venta — la venta queda
  como registro histórico de lo que efectivamente se cobró.
- `total` debe ser igual a la suma de `cantidad * precioUnitario` de sus `items` (
  invariante que valida la función `crearVentaPresencial`/`crearVentaDesdePedido`, no
  se recibe `total` como input directo del cliente para evitar inconsistencias).

## Endpoints REST

### `POST /api/tiendas/:tiendaId/ventas`

Requiere ser el dueño de `tiendaId`. Crea una venta **presencial**.

Request:

```ts
{
  compradorId?: string; // opcional: cliente anónimo si se omite
  items: Array<{ productoId: string; cantidad: number }>;
}
```

Response `201`: `{ data: Venta }` (con `origen: 'presencial'`, `total` calculado).
`409 STOCK_INSUFICIENTE` si algún producto no tiene stock suficiente.

No existe `POST /api/pedidos/:id/venta` — la venta de origen `pedido` se crea
internamente al llamar `POST /api/pedidos/:id/transicion` con `accion: 'entregar'`
(ver `04-pedidos.md`); el response de ese endpoint sigue siendo el `Pedido`
actualizado, no la `Venta` (la venta se puede consultar aparte con
`GET /api/ventas/:id` si se necesita el comprobante).

### `GET /api/ventas/:id`

Requiere ser el dueño de la tienda de la venta, o que `comprador_id` coincida con el
usuario autenticado.

Response `200`: `{ data: Venta }`.

### `GET /api/tiendas/:tiendaId/ventas`

Requiere ser el dueño de `tiendaId`. Listado paginado (ver
`00-overview.md`), es el historial de ventas de la tienda — base de datos para el
futuro módulo de balance (fuera de este MVP, ver `00-overview.md`).

Query opcional: `?desde=<ISO date>&hasta=<ISO date>`.

Response `200`: `{ data: Venta[]; page; pageSize; total }`.

## Firmas de funciones/clases TypeScript

Ubicación: `src/lib/ventas/`.

```ts
type OrigenVenta = 'presencial' | 'pedido';

interface ItemVenta {
  id: string;
  productoId: string;
  cantidad: number;
  precioUnitario: number;
}

interface Venta {
  id: string;
  tiendaId: string;
  compradorId: string | null;
  pedidoId: string | null;
  origen: OrigenVenta;
  total: number;
  items: ItemVenta[];
}

interface CrearVentaPresencialInput {
  compradorId?: string;
  items: Array<{ productoId: string; cantidad: number }>;
}

async function crearVentaPresencial(
  vendedor: Usuario,
  tiendaId: string,
  input: CrearVentaPresencialInput
): Promise<Venta>;

// Llamada internamente desde pedidos.transicionarPedido al ejecutar 'entregar'.
// No se expone como endpoint propio (ver Endpoints REST).
async function crearVentaDesdePedido(pedido: Pedido): Promise<Venta>;

async function obtenerVenta(usuario: Usuario, ventaId: string): Promise<Venta | null>;

interface ListarVentasInput {
  tiendaId: string;
  desde?: Date;
  hasta?: Date;
  page?: number;
  pageSize?: number;
}

async function listarVentas(
  vendedor: Usuario,
  input: ListarVentasInput
): Promise<{ data: Venta[]; page: number; pageSize: number; total: number }>;
```

## Casos de error a contemplar

| Código                       | Cuándo                                                              |
| ------------------------------| -----------------------------------------------------------------------|
| `TIENDA_NO_ENCONTRADA`        | `tiendaId` no existe al crear/listar ventas.                        |
| `NO_ES_DUENO_DE_TIENDA`       | El usuario autenticado no es el vendedor dueño de la tienda.        |
| `PRODUCTOS_DE_OTRA_TIENDA`    | Algún `productoId` de la venta presencial no pertenece a `tiendaId`. |
| `STOCK_INSUFICIENTE`          | Stock no alcanza para debitar la cantidad pedida de algún producto (venta presencial o al confirmar entrega de un pedido). Ver regla de atomicidad. |
| `ITEMS_VACIOS`                | `items` es un array vacío al crear una venta presencial.             |
| `VENTA_NO_ENCONTRADA`         | `:id` no existe.                                                     |
| `NO_AUTORIZADO_VENTA`         | El usuario no es ni el vendedor dueño ni el comprador de esa venta.  |
| `COMPRADOR_INVALIDO`          | `compradorId` (si se pasa) no corresponde a ningún usuario existente. |
