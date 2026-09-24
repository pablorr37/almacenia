# Módulo: pedidos

Convenciones comunes: ver [`00-overview.md`](00-overview.md). Depende de
[`03-productos.md`](03-productos.md).

Un `Pedido` es la solicitud a distancia que arma un comprador (n productos de **una
sola** tienda, no carrito multi-tienda en el MVP). El pedido en sí **no** debita stock
ni queda en el historial de ventas — eso ocurre cuando el vendedor lo confirma y se
genera la `Venta` asociada (ver [`05-ventas.md`](05-ventas.md)). El pedido es la previa;
la venta es la transacción real.

## Modelo de datos

```sql
CREATE TYPE estado_pedido AS ENUM (
  'pendiente', 'confirmado', 'listo_para_retirar', 'entregado', 'rechazado', 'cancelado'
);

CREATE TABLE pedidos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tienda_id     UUID NOT NULL REFERENCES tiendas(id),
  comprador_id  UUID NOT NULL REFERENCES usuarios(id),
  estado        estado_pedido NOT NULL DEFAULT 'pendiente',
  nota          TEXT,
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE items_pedido (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id   UUID NOT NULL REFERENCES pedidos(id),
  producto_id UUID NOT NULL REFERENCES productos(id),
  cantidad    INTEGER NOT NULL,
  precio_unitario NUMERIC(12, 2) NOT NULL, -- copia del precio del producto al momento del pedido
  CONSTRAINT cantidad_positiva CHECK (cantidad > 0)
);

CREATE INDEX pedidos_tienda_id_idx ON pedidos (tienda_id);
CREATE INDEX pedidos_comprador_id_idx ON pedidos (comprador_id);
CREATE INDEX items_pedido_pedido_id_idx ON items_pedido (pedido_id);
```

`precio_unitario` se copia en el momento de crear el pedido (no se referencia el
precio actual del producto) para que el total del pedido no cambie si el vendedor
edita el precio del producto después.

## Máquina de estados

```
pendiente ──confirmar──> confirmado ──marcarListo──> listo_para_retirar ──entregar──> entregado
    │                        │
    └──rechazar──> rechazado │
    │                        │
    └──cancelar (solo comprador, solo en 'pendiente')──> cancelado
```

- Transiciones `confirmar`/`rechazar`/`marcarListo`/`entregar`: las hace el vendedor
  dueño de la tienda.
- Transición `cancelar`: la hace el comprador, y **solo** si el pedido sigue en
  `pendiente` (una vez confirmado, ya no puede cancelarlo unilateralmente).
- `entregar` (transición a `entregado`) es lo que dispara la creación automática de la
  `Venta` asociada — ver `05-ventas.md`, sección "Origen a distancia".
- No hay transición directa `pendiente -> listo_para_retirar` ni saltos de estado.

## Reglas de negocio

- Todos los productos de un pedido deben pertenecer a la misma `tienda_id`.
- Al crear el pedido se valida que cada producto sea `esComprable` (ver
  `03-productos.md`) y que `cantidad <= stock` disponible **en ese momento** — pero
  el stock recién se debita al confirmarse la venta (`entregado`), no al crear el
  pedido. Esto significa que puede haber una carrera entre dos compradores pidiendo
  el mismo producto; se resuelve en la creación de la `Venta` (ver `05-ventas.md`,
  que sí valida y debita de forma atómica) — si en ese momento no alcanza el stock,
  la transición a `entregado` falla con `STOCK_INSUFICIENTE` y el pedido queda
  bloqueado en `listo_para_retirar` hasta que el vendedor lo resuelva manualmente
  (ajuste de stock o contacto con el comprador fuera del sistema).
- Solo el `comprador_id` puede ver/cancelar su propio pedido; solo el vendedor dueño
  de la tienda puede confirmar/rechazar/avanzar su estado.

## Endpoints REST

### `POST /api/pedidos`

Requiere sesión válida (`esComprador` es `true` para todo usuario, ver `01-auth.md`).

Request:

```ts
{
  tiendaId: string;
  items: Array<{ productoId: string; cantidad: number }>;
  nota?: string;
}
```

Response `201`: `{ data: Pedido }` (incluye `items` con `precioUnitario` copiado).

### `GET /api/pedidos/:id`

Requiere ser el comprador dueño del pedido, o el vendedor dueño de la tienda del pedido.

Response `200`: `{ data: Pedido }`.

### `GET /api/pedidos?tiendaId=` / `GET /api/pedidos?compradorId=`

Listado paginado (ver `00-overview.md`): `?tiendaId=` requiere ser el dueño de esa
tienda; `?compradorId=` solo admite el propio id del usuario autenticado o el
literal `me` como atajo (implícito en la sesión — no se puede pasar el de otro
usuario). Query opcional `?estado=<EstadoPedido>` para filtrar (ej. el perfil del
comprador separando pedidos activos/cancelados/entregados).

### `POST /api/pedidos/:id/transicion`

Requiere ser el comprador o el vendedor dueño de la tienda, según la transición (ver
máquina de estados).

Request: `{ accion: 'confirmar' | 'rechazar' | 'marcarListo' | 'entregar' | 'cancelar' }`

Response `200`: `{ data: Pedido }`. `409 TRANSICION_INVALIDA` si el estado actual no
admite esa acción.

## Firmas de funciones/clases TypeScript

Ubicación: `src/lib/pedidos/`.

```ts
type EstadoPedido =
  | 'pendiente' | 'confirmado' | 'listo_para_retirar'
  | 'entregado' | 'rechazado' | 'cancelado';

interface ItemPedido {
  id: string;
  productoId: string;
  cantidad: number;
  precioUnitario: number;
}

interface Pedido {
  id: string;
  tiendaId: string;
  compradorId: string;
  estado: EstadoPedido;
  nota: string | null;
  items: ItemPedido[];
  total: number; // derivado: SUM(cantidad * precioUnitario) de items, no columna propia
}

interface CrearPedidoInput {
  tiendaId: string;
  items: Array<{ productoId: string; cantidad: number }>;
  nota?: string;
}

async function crearPedido(comprador: Usuario, input: CrearPedidoInput): Promise<Pedido>;

async function obtenerPedido(usuario: Usuario, pedidoId: string): Promise<Pedido | null>;

type AccionPedido = 'confirmar' | 'rechazar' | 'marcarListo' | 'entregar' | 'cancelar';

async function transicionarPedido(
  usuario: Usuario,
  pedidoId: string,
  accion: AccionPedido
): Promise<Pedido>;

interface ListarPedidosInput {
  tiendaId?: string;
  compradorId?: string; // o el literal 'me'
  estado?: EstadoPedido;
  page?: number;
  pageSize?: number;
}

async function listarPedidos(
  usuario: Usuario,
  input: ListarPedidosInput
): Promise<{ data: Pedido[]; page: number; pageSize: number; total: number }>;

// Determina si una transición es válida desde el estado actual (usada por
// transicionarPedido y por los tests de la máquina de estados).
function transicionPermitida(estadoActual: EstadoPedido, accion: AccionPedido): boolean;
```

## Casos de error a contemplar

| Código                    | Cuándo                                                             |
| --------------------------| ---------------------------------------------------------------------|
| `TIENDA_NO_ENCONTRADA`     | `tiendaId` no existe al crear el pedido.                           |
| `PRODUCTOS_DE_OTRA_TIENDA` | Algún `productoId` del pedido no pertenece a `tiendaId`.            |
| `PRODUCTO_NO_COMPRABLE`    | Algún producto no es `esComprable` (no disponible o sin stock) al crear el pedido. |
| `STOCK_INSUFICIENTE`       | `cantidad` pedida excede el stock disponible al crear el pedido, o al intentar `entregar` (ver reglas de negocio). |
| `PEDIDO_NO_ENCONTRADO`     | `:id` no existe.                                                    |
| `NO_AUTORIZADO_PEDIDO`     | El usuario no es ni el comprador ni el vendedor de ese pedido.      |
| `TRANSICION_INVALIDA`      | La `accion` no está permitida desde el `estado` actual, o el rol del usuario no puede ejecutar esa acción. |
| `ITEMS_VACIOS`             | `items` es un array vacío al crear el pedido.                       |
