# Módulo: gamificación

Convenciones comunes: ver [`00-overview.md`](00-overview.md). Depende de
[`01-auth.md`](01-auth.md), [`02-tiendas.md`](02-tiendas.md) (check-in, visita),
[`03-productos.md`](03-productos.md), [`05-ventas.md`](05-ventas.md),
[`06-catalogo.md`](06-catalogo.md) y [`11-admin.md`](11-admin.md) (configuración).

**Primer paso de gamificación**: puntos por acciones concretas de vendedores y
compradores, visibles en el mapa y con historial en el perfil. Todavía no hay
insignias, niveles, rankings ni canje de puntos — el modelo sigue siendo genérico
(`tipo` libre, `metadata` libre) para sumarlos después sin migrar.

## Modelo de datos

```sql
CREATE TABLE eventos_puntos (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id             UUID NOT NULL REFERENCES usuarios(id),
  tipo                   TEXT NOT NULL,
  puntos                 NUMERIC(6, 1) NOT NULL,
  tienda_id              UUID REFERENCES tiendas(id),
  contraparte_usuario_id UUID REFERENCES usuarios(id),
  clave_unica            TEXT UNIQUE,
  metadata               JSONB,
  creado_en              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX eventos_puntos_usuario_id_idx ON eventos_puntos (usuario_id);

CREATE TABLE visitas_pagina_tienda (
  comprador_id  UUID NOT NULL REFERENCES usuarios(id),
  tienda_id     UUID NOT NULL REFERENCES tiendas(id),
  ultimo_mes    TEXT NOT NULL,          -- "YYYY-MM" (mes local del negocio)
  ultimo_valor  NUMERIC(3, 1) NOT NULL, -- puntos otorgados en la última visita puntuada
  PRIMARY KEY (comprador_id, tienda_id)
);
```

- `tipo` es un string libre (no un enum de Postgres) — agregar un tipo nuevo no
  requiere migración.
- `puntos` admite **un decimal** (ej. `0.5`, `1.8`) y puede ser negativo (para
  penalizaciones futuras; ninguna regla actual genera puntos negativos).
- `tienda_id` / `contraparte_usuario_id`: con qué tienda o con qué cliente se ganó el
  punto, para mostrar el historial ("Almacén Don José", "Cliente: Ana") sin inferirlo
  de `metadata`.
- `clave_unica` hace **idempotente** a cada regla: un mismo hecho nunca puntúa dos
  veces (borrar y recargar un producto, reintentar un request, etc.). Se inserta con
  `ON CONFLICT DO NOTHING`.
- El total de puntos de un usuario es `SUM(puntos)` (`totalPuntos`), no se cachea.
- Los checks-in GPS viven en `checkins_tienda` (`02-tiendas.md`).

### Tiempo

"Día" y "mes" se calculan en la zona horaria del negocio
(`ZONA_HORARIA_NEGOCIO = 'America/Argentina/San_Juan'`, `02-tiendas.md`), no en UTC.

## Reglas de negocio

| Actor | `tipo` | Puntos | Cuándo | `clave_unica` |
|---|---|---|---|---|
| Vendedor | `producto_cargado` | +1 | Al crear un `Producto` en su tienda (`03-productos.md`). Una vez por (tienda, producto de catálogo). | `producto_cargado:<tiendaId>:<catalogoId>` |
| Vendedor | `foto_cargada` | +1 | Al asignar una foto de catálogo o una foto personalizada a un producto (`06-catalogo.md`, `03-productos.md`). Una vez por (tienda, producto de catálogo). | `foto_cargada:<tiendaId>:<catalogoId>` |
| Vendedor | `venta_realizada` | `1 + 0.1·D + 0.1·U` | Por cada `Venta` **cobrada** de su tienda (`05-ventas.md`, cualquier origen; una venta presencial puntúa recién al cobrarse y nunca si se anula). `D` = productos distintos de la venta; `U` = suma de las unidades de las líneas con **más de 3 unidades** (todas las unidades de esa línea). | `venta_realizada:<ventaId>` |
| Comprador | `compra_realizada` | +1 | Por cada `Venta` cobrada con `compradorId` = él, **solo si** tiene ≥ 2 productos distintos o alguna línea con más de 5 unidades (comprar 1 caramelo no puntúa). No requiere GPS. | `compra_realizada:<ventaId>` |
| Comprador | `visita_compra` | +1 | "Tienda visitada" por compra. Requiere un check-in GPS del comprador en esa tienda **el mismo día** (ver abajo). | `visita_compra:<ventaId>` |
| Comprador | `checkin_gps` | +1 | Check-in GPS válido (`POST /api/tiendas/:id/checkin`). Una vez por día por tienda. Se suma aparte de `visita_compra`. | `checkin_gps:<compradorId>:<tiendaId>:<YYYY-MM-DD>` |
| Comprador | `visita_pagina` | 5 → 0,5 | Abrir la página de una tienda. Una vez por mes por tienda, con decaimiento (ver abajo). No aplica al dueño de la tienda. | `visita_pagina:<compradorId>:<tiendaId>:<YYYY-MM>` |

**Venta registrada por alguien del equipo** (`19-equipo-tienda.md`): si la venta tiene
`vendidaPorId` distinto del propietario, los puntos de `venta_realizada` se **reparten**
entre quien vendió y el propietario:

- `pctEquipo` = `tiendas.porcentaje_puntos_equipo` (lo configura el propietario, 0–100)
  o, si es `NULL`, la configuración del sistema `gamificacion.porcentaje_puntos_equipo`
  (default `50`, editable por admin, `11-admin.md`). Ningún porcentaje está fijo en el código.
- Quien vendió recibe `redondeo1(p · pctEquipo / 100)` con tipo `venta_realizada_equipo`
  y clave `venta_realizada_equipo:<ventaId>` (metadata `{ ventaId, porcentajeEquipo }`);
  el propietario recibe el resto (`p −` eso) con `venta_realizada:<ventaId>`. Así la suma
  es exacta con 1 decimal.
- No se registra un evento de 0 puntos (con 0 % o 100 % hay un solo evento).
- Si vende el propietario, la venta nace de un pedido o es anterior a `vendida_por_id`,
  el 100 % va al propietario.
- `compra_realizada` y `visita_compra` tampoco se otorgan si el comprador es quien vendió.

Ejemplos de `venta_realizada`: arroz×1 + gaseosa×6 → `1 + 0.1·2 + 0.1·6 = 1.8`;
caramelo×1 → `1.1`; yerba×2 + azúcar×3 → `1.2` (ninguna línea supera 3 unidades).

**Productos por kg**: una línea por kg cuenta como 1 producto distinto (`D`), pero
sus kilos **no** suman al bonus de unidades (`U`) ni al umbral de "más de 5
unidades" de `compra_realizada` — ese bonus es para productos por unidad (si no,
3,5 kg de papa darían 35 puntos). Una compra de un único producto por kg no
puntúa por sí sola.

Las líneas de una venta se agrupan por `productoId` antes de calcular (dos líneas
del mismo producto cuentan como uno con la suma de cantidades).

### `visita_compra` (tienda visitada por compra)

Para una `Venta` V del comprador C en la tienda T, en el día local D:

1. Tiene que existir un `CheckInTienda` de C en T en el día D. Si no existe todavía,
   no se otorga nada al crear la venta; **si el check-in llega después ese mismo
   día**, `hacerCheckIn` acredita retroactivamente las ventas de C en T del día D
   que todavía no tengan `visita_compra`.
2. La **primera** venta de C en T del día D (por `creadaEn`) siempre puntúa.
3. Las siguientes ventas del mismo día en la misma tienda puntúan solo si tienen
   **más de N productos distintos**, con N = config
   `gamificacion.umbral_items_compra_extra` (default `5`, editable por admin —
   `11-admin.md`).

Las compras con entrega a domicilio (delivery) son una feature real que se diseñará
en otra tanda: esas compras no pasan por un check-in en la tienda y van a tener su
propia regla de visita. Hoy todas las ventas son con retiro/compra en el local.

### `visita_pagina` (decaimiento mensual)

Estado por (comprador, tienda) en `visitas_pagina_tienda`. Al abrir la página en el
mes M:

- Si nunca puntuó en esa tienda → **5** puntos.
- Si ya puntuó en M → 0 (no se vuelve a dar en el mismo mes).
- Si la última visita puntuada fue en el mes anterior (M−1, consecutivo) →
  `max(0.5, ultimoValor − 0.5)`.
- Si pasaron `k ≥ 2` meses desde la última (hubo `k − 1` meses sin entrar) →
  `min(5, ultimoValor + 0.5·(k − 1))`.

Ejemplo: ene 5 · feb 4,5 · mar 4 · … · sep 1 · oct 0,5 · nov 0,5 (se estabiliza) ·
(dic y ene sin entrar) · feb 1,5 · mar 1.

### Gastos y transferencias (ronda 4)

Los canjes (`canje_premium`, `canje_publicidad`), reintegros y transferencias entre
miembros de una tienda son eventos de este mismo registro, con puntos negativos o
positivos. Reglas, topes y atomicidad: [`23-puntos-pagos.md`](23-puntos-pagos.md).

### Robustez

Otorgar puntos nunca hace fallar la operación de negocio que lo dispara: si la
gamificación tira error al crear un producto/venta, la venta/producto queda creado
igual y el error se loguea. Los puntos se otorgan después de confirmar la operación
(fuera de su transacción).

## Endpoints REST

### `GET /api/gamificacion/puntos`

Requiere sesión. Response `200`: `{ data: { total: number; saldo: number; ganados: number } }`
(del usuario autenticado). Desde la ronda 4 (`23-puntos-pagos.md`) los puntos también se
gastan: `saldo` = suma de todos los eventos (incluye canjes y transferencias, que son
eventos negativos o positivos); `ganados` = eventos positivos sin `transferencia_recibida` ni
`reintegro_publicidad` (lo usa el radio de alcance); `total` = `saldo`, por compatibilidad.

### `GET /api/gamificacion/historial`

Requiere sesión. Paginado (`00-overview.md`), orden `creadoEn desc`. Response `200`:
`{ data: MovimientoPuntos[]; page; pageSize; total }`.

## Firmas de funciones/clases TypeScript

Ubicación: `src/lib/gamificacion/`.

```ts
interface EventoPuntos {
  id: string;
  usuarioId: string;
  tipo: string;
  puntos: number;
  tiendaId: string | null;
  contraparteUsuarioId: string | null;
  metadata: Record<string, unknown> | null;
  creadoEn: string;
}

interface RegistrarEventoOpciones {
  tiendaId?: string;
  contraparteUsuarioId?: string;
  claveUnica?: string;
  metadata?: Record<string, unknown>;
}

// Con claveUnica ya usada devuelve null (no inserta).
async function registrarEvento(
  usuarioId: string,
  tipo: string,
  puntos: number,
  opciones?: RegistrarEventoOpciones
): Promise<EventoPuntos | null>;

async function totalPuntos(usuarioId: string): Promise<number>;

interface MovimientoPuntos {
  id: string;
  tipo: string;
  descripcion: string; // texto legible, ej. "Venta realizada", "Visitaste la tienda"
  puntos: number;
  creadoEn: string;
  tienda: { id: string; nombre: string } | null;
  contraparte: { id: string; nombre: string } | null;
}

async function historialPuntos(
  usuario: Usuario,
  paginacion: { page?: number; pageSize?: number }
): Promise<{ data: MovimientoPuntos[]; page: number; pageSize: number; total: number }>;

// --- Reglas puras ---
interface LineaVenta { productoId: string; cantidad: number }
function puntosVentaVendedor(items: LineaVenta[]): number; // 1 + 0.1·D + 0.1·U
function compraPuntua(items: LineaVenta[]): boolean; // ≥2 distintos o alguna línea >5
function productosDistintos(items: LineaVenta[]): number;

interface EstadoVisitaPagina { ultimoMes: string; ultimoValor: number } // "YYYY-MM"
function puntosVisitaPagina(previo: EstadoVisitaPagina | null, mesActual: string): number; // 0 si ya puntuó ese mes

function diaLocal(fecha: Date): string; // "YYYY-MM-DD" en ZONA_HORARIA_NEGOCIO
function mesLocal(fecha: Date): string; // "YYYY-MM"

// --- Disparadores (los llaman los otros módulos) ---
async function otorgarPorProductoCargado(vendedorId: string, tiendaId: string, catalogoId: string): Promise<void>;
async function otorgarPorFotoCargada(vendedorId: string, tiendaId: string, catalogoId: string): Promise<void>;
// Otorga venta_realizada (vendedor), compra_realizada y visita_compra (comprador).
async function otorgarPorVenta(ventaId: string): Promise<void>;
// Otorga checkin_gps y acredita visita_compra retroactiva del día. Devuelve los puntos otorgados.
async function otorgarPorCheckIn(compradorId: string, tiendaId: string, fecha: Date): Promise<number>;
async function registrarVisitaPagina(usuario: Usuario, tiendaId: string): Promise<number>;
```

## Casos de error a contemplar

| Código                 | Cuándo                                              |
| ----------------------- | ------------------------------------------------------|
| `TIENDA_NO_ENCONTRADA`  | `registrarVisitaPagina` con una tienda inexistente.  |
