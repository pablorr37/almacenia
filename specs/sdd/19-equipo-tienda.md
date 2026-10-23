# Módulo: varias tiendas, equipo y permisos; pantalla de inicio

Convenciones comunes: ver [`00-overview.md`](00-overview.md). Depende de
[`01-auth.md`](01-auth.md), [`02-tiendas.md`](02-tiendas.md),
[`03-productos.md`](03-productos.md), [`04-pedidos.md`](04-pedidos.md) y
[`05-ventas.md`](05-ventas.md). Pedido del usuario: punto 7 de `docs/memoria.md`.

Un usuario puede tener **varias tiendas** (sucursales) y sumar a otros usuarios de la
app como **encargados** o **empleados** de cada una, con **permisos** que da y quita.

## Modelo de datos

```sql
-- Un dueño, varias tiendas: se quita el UNIQUE de tiendas.vendedor_id.
ALTER TABLE tiendas DROP CONSTRAINT tiendas_vendedor_id_key;
CREATE INDEX tiendas_vendedor_id_idx ON tiendas (vendedor_id);

CREATE TYPE rol_miembro AS ENUM ('encargado', 'empleado');
CREATE TYPE permiso_tienda AS ENUM (
  'vender', 'cobrar', 'anular', 'precios', 'stock', 'productos',
  'fotos', 'pedidos', 'balance', 'usuarios'
);

CREATE TABLE miembros_tienda (
  tienda_id   UUID NOT NULL REFERENCES tiendas(id) ON DELETE CASCADE,
  usuario_id  UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  rol         rol_miembro NOT NULL,
  permisos    permiso_tienda[] NOT NULL DEFAULT '{}',
  creado_en   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tienda_id, usuario_id)
);
CREATE INDEX miembros_tienda_usuario_id_idx ON miembros_tienda (usuario_id);

-- Quién registró la venta (dueño o miembro). NULL en ventas viejas y en las que
-- nacen de un pedido.
ALTER TABLE ventas ADD COLUMN vendida_por_id UUID REFERENCES usuarios(id) ON DELETE SET NULL;
```

- El **propietario** de una tienda es `tiendas.vendedor_id`. No es fila de
  `miembros_tienda`.
- `Venta.vendidaPorId` y `vendidaPor: { id, nombre } | null` se suman a la respuesta
  `Venta` (`05-ventas.md`).

## Roles y permisos

| Permiso | Qué habilita |
| --- | --- |
| `vender` | Crear ventas en el punto de venta, ver la lista de productos para vender y marcar favoritos. Una venta que se cobra en el momento (`cobrarAhora`) pide además `cobrar`. |
| `cobrar` | Cobrar una venta por cobrar. |
| `anular` | Anular una venta por cobrar. |
| `precios` | Cambiar precio y precio de oferta. |
| `stock` | Cambiar el stock. |
| `productos` | Alta, baja y edición del resto de los datos del producto (nombre, descripción, disponible, destacado). |
| `fotos` | Cambiar fotos de productos (sigue sujeto al plan, `10-planes.md`). |
| `pedidos` | Ver los pedidos de la tienda y confirmarlos, rechazarlos, marcarlos listos y entregarlos. |
| `balance` | Ver el balance de la tienda. |
| `usuarios` | Gestionar el equipo (sumar, editar y quitar miembros). |
| `publicidad` | Crear, pausar y finalizar campañas de publicidad de la tienda, pagando con sus propios puntos o pesos (`21-publicidad.md`). |

**Transferencias de puntos** (ronda 4): cualquier persona del equipo (propietario,
encargados, empleados) puede transferir puntos a otra de **la misma tienda**, con topes
configurables (`23-puntos-pagos.md`). No requiere permiso.

- **Propietario:** tiene todos los permisos y no se le pueden quitar. Además, solo él
  puede:
  - editar los datos de la tienda (nombre, descripción, dirección, ubicación,
    rubro, horarios, medios de pago, activa, foto de portada);
  - pedir la verificación;
  - valorar clientes (`13-valoraciones-clientes.md`).
- **Permisos por defecto** al sumar un miembro, si no se mandan explícitos:
  - `encargado`: todos menos `usuarios`;
  - `empleado`: `vender` y `cobrar`.
- El rol es una etiqueta para la UI y para los permisos por defecto. Lo que habilita
  cada acción son los permisos.
- **Listados que piden más de un permiso posible:**
  - ventas de la tienda (`GET /api/tiendas/:id/ventas`) y una venta puntual: alcanza
    con `vender`, `cobrar` o `balance`;
  - productos de la tienda: son públicos, no cambia nada.

### Gestión del equipo

- Puede gestionar el equipo el propietario o un miembro con `usuarios`.
- Un miembro con `usuarios`:
  - no puede modificarse ni quitarse a sí mismo por esta vía;
  - solo puede dar permisos que él tiene.
- **Se suma** a un usuario existente de la app, por su **email** o por su **código de
  cliente** (el de 6 dígitos o el QR de "Compartir mis datos", `01-auth.md`).
  - Tiene que tener la cuenta `activa`.
  - No puede ser el propietario.
  - No puede ser ya miembro de esa tienda (`409 MIEMBRO_YA_EXISTE`).
- Cualquier miembro puede **dejar** una tienda (quitarse a sí mismo).
- Borrar un usuario (admin) o una tienda borra sus filas de `miembros_tienda`
  (cascada). Las ventas que registró quedan con `vendida_por_id = NULL`.

### Varias tiendas

- `POST /api/tiendas` ya no rechaza a un usuario que tiene tienda: crea una más. Se
  quita el error `USUARIO_YA_TIENE_TIENDA`.
- Los puntos de gamificación de una venta registrada por un miembro se **reparten**
  entre ese miembro y el propietario según `tiendas.porcentaje_puntos_equipo`, que
  configura el propietario (si no lo configura, rige el default del sistema, 50 %).
  Detalle en `12-gamificacion.md`.
- El check-in o la visita a una tienda propia, o a una donde el usuario es miembro,
  no suma puntos.
- Para las funciones que se resuelven "por usuario" y no por tienda, se usan las
  tiendas propias del usuario:
  - el plan del banco de fotos (`16-banco-fotos.md`) es el mejor plan entre sus
    tiendas propias y las tiendas donde tiene `fotos`;
  - la foto compartida del catálogo (`06-catalogo.md`) se habilita si alguna de esas
    tiendas es premium;
  - valorar clientes acepta `tiendaId` opcional; si no viene, usa la primera tienda
    propia.
- La **tienda activa** en la UI es una preferencia del navegador (`localStorage`). El
  servidor siempre chequea el permiso sobre la tienda que se pide.

## Balance básico

Primer paso del punto 1 del pedido. La ronda 3 suma costo, ganancia e impuestos. Pide
el permiso `balance`.

- **Rango:** `desde` / `hasta` (fechas `YYYY-MM-DD`, inclusive, en la hora local del
  negocio `America/Argentina/San_Juan`). Por defecto, los últimos 7 días contando hoy.
  Máximo 366 días (`400 RANGO_INVALIDO`).
- Se cuentan las ventas **creadas** en el rango:
  - **cobradas**: cantidad y total;
  - **por cobrar**: cantidad y total;
  - **anuladas**: cantidad.
- Sobre las cobradas:
  - total por medio de pago (`sin_medio` si no tiene);
  - total y cantidad por día (todos los días del rango, también los que dan 0);
  - total y cantidad por quien registró la venta (`vendidaPor`, `null` = pedidos o
    ventas viejas).

## Pantalla de inicio (UI)

- **Sin sesión:** la lista de negocios cercanos de siempre (`HomeInvitado`).
- **Con sesión:** un **menú** que enlaza a cada función o grupo de funciones.
  - **Comprar:** Mapa (pasa a `/mapa`), Listas de compras, Mis pedidos, Mis puntos.
  - **Mi negocio** (si el usuario es propietario o miembro de alguna tienda): va
    primero. Tiene un selector de tienda activa si tiene más de una y estos accesos,
    según sus permisos:

    | Acceso | Permiso que pide |
    | --- | --- |
    | Nueva venta | `vender` |
    | Stock (productos) | `productos`, `stock` o `precios` |
    | Pedidos | `pedidos` |
    | Usuarios | `usuarios` |
    | Balance | `balance` |
    | Datos de la tienda | solo propietario |

    Al final, **Nueva sucursal**.
  - **Si no tiene tienda:** "Publicá tu tienda".
  - **Cuenta:** Perfil (y Admin si es admin).
- `/mi-tienda` acepta `?tienda=<id>&seccion=vender|productos|pedidos|tienda` para
  entrar directo desde el menú. Solo muestra las secciones que habilitan los permisos.
  `/mi-tienda?nueva=1` abre el alta de una sucursal.
- `/mi-tienda/equipo?tienda=<id>` (Usuarios) y `/mi-tienda/balance?tienda=<id>`
  (Balance) son páginas propias.

## Endpoints REST

### `GET /api/tiendas/mias`

Requiere sesión. Las tiendas propias (primero) y las tiendas donde el usuario es
miembro, cada grupo por nombre.

```ts
{ data: Array<{ tienda: Tienda; rol: 'propietario' | 'encargado' | 'empleado'; permisos: Permiso[] }> }
```

### `GET /api/tiendas/mia`

Sigue existiendo (`02-tiendas.md`). Acepta `?tiendaId=`:

- **con `tiendaId`:** devuelve esa tienda si el usuario es propietario o miembro; si
  no, `403 NO_ES_DUENO_DE_TIENDA`;
- **sin `tiendaId`:** devuelve la primera de `mias`.

`404 TIENDA_NO_ENCONTRADA` si no tiene ninguna.

### `GET /api/tiendas/:tiendaId/miembros`

Requiere el permiso `usuarios`.

```ts
{ data: Array<{
    usuario: { id: string; nombre: string; email: string; avatarUrl: string | null };
    rol: 'encargado' | 'empleado';
    permisos: Permiso[];
    creadoEn: string;
  }> }
```

### `POST /api/tiendas/:tiendaId/miembros`

Requiere `usuarios`. Request:

```ts
{ email?: string; codigo?: string; rol: 'encargado' | 'empleado'; permisos?: Permiso[] }
```

- Va `email` o `codigo`, uno de los dos.
- Response `201`: `{ data: MiembroTienda }`.
- Errores:
  - `404 USUARIO_NO_ENCONTRADO` (email inexistente o cuenta no activa);
  - `400 CODIGO_CLIENTE_INVALIDO`;
  - `409 MIEMBRO_YA_EXISTE`;
  - `409 ES_PROPIETARIO`;
  - `400 ROL_INVALIDO`;
  - `400 PERMISO_INVALIDO`;
  - `403 SIN_PERMISO` (dar un permiso que quien gestiona no tiene).

### `PATCH /api/tiendas/:tiendaId/miembros/:usuarioId`

Requiere `usuarios`. Request: `{ rol?, permisos? }`. Response `200`:
`{ data: MiembroTienda }`. `404 MIEMBRO_NO_ENCONTRADO`; `403 SIN_PERMISO` si es uno
mismo.

### `DELETE /api/tiendas/:tiendaId/miembros/:usuarioId`

Requiere `usuarios`, o que sea uno mismo (dejar la tienda). Response `200`:
`{ data: { usuarioId } }`.

### `GET /api/tiendas/:tiendaId/balance`

Requiere `balance`. Query: `?desde=YYYY-MM-DD&hasta=YYYY-MM-DD`.

```ts
{ data: {
    desde: string; hasta: string;
    cobradas: { cantidad: number; total: number };
    porCobrar: { cantidad: number; total: number };
    anuladas: { cantidad: number };
    porMedioPago: Array<{ medioPago: MedioPago | 'sin_medio'; total: number; cantidad: number }>;
    porDia: Array<{ fecha: string; total: number; cantidad: number }>;
    porVendedor: Array<{ usuario: { id: string; nombre: string } | null; total: number; cantidad: number }>;
  } }
```

## Firmas de funciones/clases TypeScript

Ubicación: `src/lib/equipo/equipo.ts` (permisos y miembros) y
`src/lib/ventas/balance.ts` (balance).

```ts
type Permiso = 'vender' | 'cobrar' | 'anular' | 'precios' | 'stock' | 'productos'
  | 'fotos' | 'pedidos' | 'balance' | 'usuarios';
type Rol = 'propietario' | 'encargado' | 'empleado';

const PERMISOS: readonly Permiso[];
function permisosPorDefecto(rol: 'encargado' | 'empleado'): Permiso[];

// Rol y permisos del usuario en la tienda; null si no es propietario ni miembro.
function accesoATienda(usuarioId: string, tiendaId: string): Promise<{ rol: Rol; permisos: Permiso[] } | null>;

// Exige al menos uno de los permisos. Errores:
// - TIENDA_NO_ENCONTRADA;
// - NO_ES_DUENO_DE_TIENDA si no tiene acceso;
// - SIN_PERMISO si tiene acceso pero no el permiso.
// 'propietario' exige ser el dueño.
function exigirPermiso(usuario: Usuario, tiendaId: string, permiso: Permiso | Permiso[] | 'propietario'): Promise<{ rol: Rol; permisos: Permiso[] }>;

function misTiendas(usuario: Usuario): Promise<Array<{ tienda: Tienda; rol: Rol; permisos: Permiso[] }>>;
function listarMiembros(usuario: Usuario, tiendaId: string): Promise<MiembroTienda[]>;
function agregarMiembro(usuario: Usuario, tiendaId: string, input: { email?: string; codigo?: string; rol: 'encargado' | 'empleado'; permisos?: Permiso[] }): Promise<MiembroTienda>;
function actualizarMiembro(usuario: Usuario, tiendaId: string, miembroId: string, input: { rol?: 'encargado' | 'empleado'; permisos?: Permiso[] }): Promise<MiembroTienda>;
function quitarMiembro(usuario: Usuario, tiendaId: string, miembroId: string): Promise<{ usuarioId: string }>;

function balanceTienda(usuario: Usuario, tiendaId: string, rango: { desde?: string; hasta?: string }, hoy?: Date): Promise<Balance>;
```

## Errores

| Código | Status | Cuándo |
| --- | --- | --- |
| `SIN_PERMISO` | 403 | Es miembro, pero no tiene el permiso. |
| `MIEMBRO_YA_EXISTE` | 409 | El usuario ya es miembro de la tienda. |
| `ES_PROPIETARIO` | 409 | Se intenta sumar al propietario como miembro. |
| `MIEMBRO_NO_ENCONTRADO` | 404 | No es miembro de esa tienda. |
| `ROL_INVALIDO` | 400 | Rol distinto de `encargado` o `empleado`. |
| `PERMISO_INVALIDO` | 400 | Algún permiso no existe. |
| `RANGO_INVALIDO` | 400 | Fechas mal formadas, `desde > hasta` o más de 366 días. |
