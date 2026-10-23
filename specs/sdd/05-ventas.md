# Módulo: ventas

Convenciones comunes: ver [`00-overview.md`](00-overview.md). Depende de
[`03-productos.md`](03-productos.md) y [`04-pedidos.md`](04-pedidos.md).

La **venta** es la instancia real de la transacción: el momento en que el vendedor
cierra el trato (n productos = x dinero). Es lo que debita el `stock` de `productos` y
queda en el historial de la tienda (base para el futuro módulo de balance/reportes,
fuera de este MVP). Toda venta tiene un origen:

- **Presencial**: el vendedor la carga directamente en el momento, sin `pedido` previo
  — es un mini punto de venta interno para ventas de mostrador (pestaña "Vender" de
  mi-tienda). Tiene estado de cobro: puede quedar *por cobrar* (fiado, transferencia
  que todavía no llegó) hasta que el vendedor marca el pago recibido.
  **UI del punto de venta**: arriba, cuatro pestañas — Todos, Frecuentes, Recientes y
  Favoritos (`GET /api/tiendas/:id/productos?paraVenta=1`, `03-productos.md`) — y
  debajo el buscador, que filtra dentro de la pestaña activa. La lista muestra 3
  productos a la vista con scroll si hay más, y un botón "Ocultar lista" / "Mostrar
  lista" (se recuerda por navegador) para que el ticket quede arriba. Cada fila tiene
  una estrella para marcar favorito. En productos por kg se puede cargar por importe
  ("$ Importe", ver `03-productos.md`).

  **Escanear producto**: al lado del buscador, el botón "Escanear producto" abre el
  escáner (código de barras o QR que contenga el código). El texto leído se busca entre
  los productos de la tienda (`codigoBarras` del catálogo, que
  `GET /api/tiendas/:id/productos?paraVenta=1` devuelve en cada producto). Para
  comparar, se dejan solo los dígitos y un UPC-A de 12 dígitos equivale al EAN-13 con
  un 0 adelante. También se acepta el `id` del producto (QR propio).
  - Si lo encuentra, **suma un paso** (1 unidad, o el paso de kg) a esa línea del
    ticket y avisa "Agregado: <nombre>". Si el producto está pausado, sin stock o ya
    llegó al stock disponible, avisa y no suma.
  - Si no lo encuentra: "No tenés cargado un producto con el código <código>", con un
    link a Stock para darlo de alta (el alta busca ese código en el catálogo,
    `06-catalogo.md`).
  - Función pura: `productoPorCodigo(productos, texto)` en `src/lib/ventas/escaneo.ts`.
- **A distancia**: se genera automáticamente cuando un `Pedido` pasa a `entregado`
  (ver `04-pedidos.md`). No existe una forma de crear manualmente una venta "a
  distancia" — siempre nace de esa transición.

## Modelo de datos

```sql
CREATE TYPE origen_venta AS ENUM ('presencial', 'pedido');
CREATE TYPE estado_venta AS ENUM ('por_cobrar', 'cobrada', 'anulada');

CREATE TABLE ventas (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tienda_id    UUID NOT NULL REFERENCES tiendas(id),
  comprador_id UUID REFERENCES usuarios(id), -- null si es presencial sin comprador registrado
  pedido_id    UUID REFERENCES pedidos(id),  -- null si es presencial
  origen       origen_venta NOT NULL,
  total        NUMERIC(12, 2) NOT NULL,
  estado       estado_venta NOT NULL DEFAULT 'cobrada',
  medio_pago   medio_pago,                   -- 02-tiendas.md; null en ventas de pedidos
  nota         TEXT,                          -- ej. "Juan, paga el viernes"
  creada_en    TIMESTAMPTZ NOT NULL DEFAULT now(),
  cobrada_en   TIMESTAMPTZ,
  anulada_en   TIMESTAMPTZ,
  CONSTRAINT total_no_negativo CHECK (total >= 0),
  CONSTRAINT pedido_id_solo_si_origen_pedido
    CHECK ((origen = 'pedido') = (pedido_id IS NOT NULL))
);

CREATE TABLE items_venta (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venta_id        UUID NOT NULL REFERENCES ventas(id),
  producto_id     UUID NOT NULL REFERENCES productos(id),
  cantidad        NUMERIC(10, 3) NOT NULL, -- unidades o kg (ver 03-productos.md, "Cantidades y unidades")
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
  inmutable (no hay `UPDATE`/`DELETE` de ventas en el MVP). Lo único que cambia
  después de crearla es su **estado de cobro** (ver máquina de estados).

## Máquina de estados de cobro (ventas presenciales)

```
cerrar (cobrarAhora = false) ─▶ por_cobrar ──cobrar──▶ cobrada
                                     └──────anular──▶ anulada   (devuelve el stock)
cerrar (cobrarAhora = true, default) ─▶ cobrada
```

- El stock se descuenta **al cerrar** (la mercadería sale del local aunque la plata
  llegue después). `anular` lo devuelve en una transacción.
- `cobrar` y `anular` solo desde `por_cobrar`; el resto → `409 TRANSICION_INVALIDA`.
  Solo el vendedor dueño de la tienda.
- Las ventas de origen `pedido` nacen `cobrada` (se pagan al retirar).
- Una venta `anulada` no cuenta en métricas, historial de caja ni gamificación.

## Reglas de negocio

- **Gamificación**: cuando una venta queda `cobrada` (al cerrarla con cobro
  inmediato, al cobrarla después, o al entregarse un pedido) se otorgan
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
  - Precio unitario: el precio vigente del producto (`precioOferta ?? precio`).
  - `medioPago` opcional; si viene, tiene que ser uno de los `medios_de_pago` de la
    tienda (`MEDIO_PAGO_INVALIDO`) — si la tienda no configuró medios, se acepta
    cualquiera. La UI de mostrador siempre lo manda.
  - `cobrarAhora` default `true` (compatibilidad: una venta sin el campo es una venta
    cobrada en el acto, como antes); la UI manda `false` para "Cerrar · por cobrar".
  - Cliente opcional por `compradorCodigo` (el código de 6 dígitos o QR que el
    cliente comparte desde su perfil; vencido → `CODIGO_CLIENTE_INVALIDO`),
    `compradorEmail` (cuenta registrada) o `compradorId`: si no existe,
    `COMPRADOR_INVALIDO`; si es el propio vendedor, `VENTA_PROPIA`. Sin email, la
    venta es anónima (`comprador_id` null).
- **Origen a distancia**: no tiene endpoint propio de creación — es un efecto interno
  de `transicionarPedido(usuario, pedidoId, 'entregar')` (ver `04-pedidos.md`). Copia
  `tienda_id`, `comprador_id` y los `items` (con sus `precioUnitario` ya congelados)
  directamente desde el pedido.
- Las ventas son **inmutables** salvo el estado de cobro: no existen endpoints de
  edición ni borrado. Un error
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
  items: Array<{ productoId: string; cantidad: number }>;
  medioPago?: MedioPago;
  cobrarAhora?: boolean;   // default true: nace 'cobrada'; false: 'por_cobrar'
  compradorEmail?: string; // opcional: cliente anónimo si se omite (o compradorId)
  compradorCodigo?: string; // código de 6 dígitos / QR que comparte el cliente (01-auth.md)
  nota?: string;           // hasta 200 caracteres
}
```

Response `201`: `{ data: Venta }` (con `origen: 'presencial'`, `total` calculado).
`409 STOCK_INSUFICIENTE` si algún producto no tiene stock suficiente.

No existe `POST /api/pedidos/:id/venta` — la venta de origen `pedido` se crea
internamente al llamar `POST /api/pedidos/:id/transicion` con `accion: 'entregar'`
(ver `04-pedidos.md`); el response de ese endpoint sigue siendo el `Pedido`
actualizado, no la `Venta` (la venta se puede consultar aparte con
`GET /api/ventas/:id` si se necesita el comprobante).

### `POST /api/ventas/:id/transicion`

Requiere ser el dueño de la tienda de la venta. Request:
`{ accion: 'cobrar' | 'anular' }`. Response `200`: `{ data: Venta }`.
`409 TRANSICION_INVALIDA` si la venta no está `por_cobrar`.

### `GET /api/ventas/:id`

Requiere ser el dueño de la tienda de la venta, o que `comprador_id` coincida con el
usuario autenticado.

Response `200`: `{ data: Venta }`.

### `GET /api/tiendas/:tiendaId/ventas`

Requiere ser el dueño de `tiendaId`. Listado paginado (ver
`00-overview.md`), es el historial de ventas de la tienda — base de datos para el
futuro módulo de balance (fuera de este MVP, ver `00-overview.md`).

Query opcional: `?desde=<ISO date>&hasta=<ISO date>&estado=<EstadoVenta>`.
Orden: más nuevas primero.

Response `200`: `{ data: Venta[]; page; pageSize; total }`.

## Firmas de funciones/clases TypeScript

Ubicación: `src/lib/ventas/`.

```ts
type OrigenVenta = 'presencial' | 'pedido';
type EstadoVenta = 'por_cobrar' | 'cobrada' | 'anulada';

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
  estado: EstadoVenta;
  medioPago: MedioPago | null;
  nota: string | null;
  total: number;
  items: ItemVenta[]; // cada ítem incluye nombre y unidad del producto
  comprador: { nombre: string; email: string } | null;
  vendidaPor: { id: string; nombre: string } | null; // quién la registró (19-equipo-tienda.md)
  creadaEn: string;
  cobradaEn: string | null;
  anuladaEn: string | null;
}

interface CrearVentaPresencialInput {
  items: Array<{ productoId: string; cantidad: number }>;
  medioPago?: MedioPago;
  cobrarAhora?: boolean;
  compradorEmail?: string;
  compradorCodigo?: string;
  compradorId?: string;
  nota?: string;
}

async function crearVentaPresencial(
  vendedor: Usuario,
  tiendaId: string,
  input: CrearVentaPresencialInput
): Promise<Venta>;

// Llamada internamente desde pedidos.transicionarPedido al ejecutar 'entregar'.
// No se expone como endpoint propio (ver Endpoints REST).
async function crearVentaDesdePedido(pedido: Pedido): Promise<Venta>;

async function transicionarVenta(
  vendedor: Usuario,
  ventaId: string,
  accion: 'cobrar' | 'anular'
): Promise<Venta>;

async function obtenerVenta(usuario: Usuario, ventaId: string): Promise<Venta | null>;

interface ListarVentasInput {
  tiendaId: string;
  desde?: Date;
  hasta?: Date;
  estado?: EstadoVenta;
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
| `NO_ES_DUENO_DE_TIENDA`       | El usuario no es propietario ni miembro de la tienda (`19-equipo-tienda.md`). |
| `SIN_PERMISO`                 | Es miembro, pero no tiene el permiso (`vender`, `cobrar`, `anular`). |
| `PRODUCTOS_DE_OTRA_TIENDA`    | Algún `productoId` de la venta presencial no pertenece a `tiendaId`. |
| `STOCK_INSUFICIENTE`          | Stock no alcanza para debitar la cantidad pedida de algún producto (venta presencial o al confirmar entrega de un pedido). Ver regla de atomicidad. |
| `ITEMS_VACIOS`                | `items` es un array vacío al crear una venta presencial.             |
| `VENTA_NO_ENCONTRADA`         | `:id` no existe.                                                     |
| `NO_AUTORIZADO_VENTA`         | El usuario no es ni el vendedor dueño ni el comprador de esa venta.  |
| `COMPRADOR_INVALIDO`          | `compradorEmail`/`compradorId` (si se pasa) no corresponde a ningún usuario existente. |
| `VENTA_PROPIA`                | `compradorEmail` es el del propio vendedor.                          |
| `MEDIO_PAGO_INVALIDO`         | `medioPago` no es uno de los medios que acepta la tienda.           |
| `NOTA_INVALIDA`               | `nota` de más de 200 caracteres.                                     |
| `TRANSICION_INVALIDA`         | `cobrar`/`anular` sobre una venta que no está `por_cobrar` (`409`).  |

## Foto fiscal y comprobantes

Cada ítem guarda costo, alícuota y desglose (neto, IVA, internos) al venderse; los
comprobantes (A/B/C, numeración, `Facturador`): ver
[`20-precios-facturacion.md`](20-precios-facturacion.md).
