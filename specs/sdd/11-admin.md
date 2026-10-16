# Módulo: admin

Convenciones comunes: ver [`00-overview.md`](00-overview.md). Depende de
[`01-auth.md`](01-auth.md) (`esAdmin`), [`02-tiendas.md`](02-tiendas.md)
(verificación), [`05-ventas.md`](05-ventas.md) y [`10-planes.md`](10-planes.md).

Panel de solo-lectura para métricas + bandeja de revisión de solicitudes de
verificación. Todas las rutas bajo `/api/admin/**` requieren `esAdmin = true`
(`requireAdmin`, `01-auth.md`) — `403 FORBIDDEN` si no.

## Reglas de negocio

- Las métricas son agregaciones de solo lectura sobre datos ya existentes
  (`Venta`, `Pedido`, `Tienda`, `Usuario`) — no hay tablas propias de este módulo
  salvo lo que ya define `02-tiendas.md` (`SolicitudVerificacion`).
- "Tiendas nuevas" en un período: `COUNT(*) WHERE creadaEn BETWEEN`.
- "Tiendas dadas de baja" en un período: `COUNT(*) WHERE desactivadaEn BETWEEN`
  (columna agregada en `02-tiendas.md` específicamente para este reporte).
- Revisar una solicitud de verificación (aprobar/rechazar) es una escritura
  delegada a `revisarSolicitudVerificacion` (`02-tiendas.md`).
- **Verificar una tienda directamente** (`PATCH /api/admin/tiendas/:id/verificacion`):
  el admin puede marcarla verificada o quitarle la verificación sin que exista una
  solicitud. Si hay una solicitud `pendiente`, queda resuelta en la misma operación
  (`aprobada` al verificar, `rechazada` al quitar), con `revisadaPor = admin`.
- **Cambiar el plan** de una tienda (free ↔ premium) desde la lista de usuarios,
  con el endpoint existente de `10-planes.md`. Al pasar a premium la tienda puede
  subir fotos propias (`fotos_personalizadas`).
- **Pausar, banear y reactivar** usuarios (`estado_cuenta`, `01-auth.md`) con
  `PATCH /api/admin/usuarios/:id` `{ estadoCuenta, motivo? }`.
- **Eliminar** un usuario (`DELETE /api/admin/usuarios/:id`): borrado físico de la
  base en una transacción. Se borran su tienda y todo lo que cuelga de ella
  (productos, horarios, pedidos, ventas, reseñas, solicitudes, valoraciones), sus
  pedidos, reseñas y valoraciones como comprador, y en cascada sus listas, puntos,
  check-ins, visitas y códigos de cliente. En ventas de **otras** tiendas donde
  figuraba como comprador, `comprador_id` queda en `null` (la venta queda anónima;
  no se rompe el historial ajeno). Las fotos del banco que subió quedan sin autor.
  Exige reescribir el email del usuario como confirmación.
- Un admin no puede pausar, banear ni eliminarse a sí mismo (`ACCION_SOBRE_SI_MISMO`)
  ni hacerlo con otro admin (`FORBIDDEN`).
- Marcar o desmarcar un usuario como **tester** (`esTester`, `01-auth.md`) con
  `PATCH /api/admin/usuarios/:id`. `esAdmin` sigue sin endpoint.
- Cambiar el **plan del usuario** (free / premium / plata, `18-alcance.md`) con
  `PATCH /api/admin/usuarios/:id` `{ plan }`. `UsuarioAdmin` incluye `plan`.
- **Curaduría de fotos** (`/admin/fotos`, admin y testers): lista de entradas de
  catálogo sin foto con un botón "Buscar" que abre el buscador de fotos
  (`16-banco-fotos.md`) precargado con el nombre, y cola de fotos `pendiente`
  para aprobar o rechazar.

## Endpoints REST

### `GET /api/admin/metricas`

Query: `?desde=<ISO date>&hasta=<ISO date>` (default: últimos 30 días).

Response `200`:

```ts
{
  data: {
    ventas: { cantidad: number; totalFacturado: number };
    pedidos: Record<EstadoPedido, number>; // conteo por estado
    tiendasNuevas: number;
    tiendasDadasDeBaja: number;
    usuariosNuevos: number;
  }
}
```

### `GET /api/admin/verificaciones`

Query opcional `?estado=pendiente|aprobada|rechazada` (default `pendiente`).
Paginado. Response `200`: `{ data: SolicitudVerificacionAdmin[]; page; pageSize; total }`,
donde cada solicitud trae además los datos para decidir sin buscar la tienda:
`tienda: { id; nombre; direccion; rubro; vendedor: { nombre; email } }`.

### `PATCH /api/admin/verificaciones/:id`

Request: `{ decision: 'aprobada' | 'rechazada'; notaAdmin?: string }`. Delegado a
`revisarSolicitudVerificacion` (`02-tiendas.md`). Response `200`:
`{ data: SolicitudVerificacion }`.

### `PATCH /api/admin/tiendas/:id/plan`

Ver `10-planes.md`.

### `PATCH /api/admin/tiendas/:id/verificacion`

Request `{ verificada: boolean }`. Response `200`:
`{ data: { id: string; verificada: boolean } }`. `400 VERIFICADA_INVALIDA` si no es
booleano; `404 TIENDA_NO_ENCONTRADA`; `403 FORBIDDEN` si no es admin.

### `GET /api/admin/diagnostico`

Solo admin. Prueba la base de datos y el almacenamiento de fotos (escribe y borra
un archivo `diagnostico/<uuid>.txt` en el bucket). Response `200`:
`{ data: { db: 'ok' | 'error'; almacenamiento: { ok: boolean; bucket: string; endpoint: string; error?: string; lecturaPublica: boolean; errorLectura?: string } } }`
— `lecturaPublica` indica si el navegador va a poder mostrar las fotos.
Nunca devuelve credenciales. En `/admin` se usa desde la tarjeta "Estado del
sistema" (botón "Probar almacenamiento").

### `GET /api/admin/usuarios`

Query opcional `?q=<texto>&rol=comprador|vendedor|admin&plan=free|premium&estadoCuenta=activa|pausada|baneada&page&pageSize`.
`q` busca (sin distinguir mayúsculas) en nombre, email y nombre de la tienda.
`rol` filtra por el flag correspondiente (`esComprador`/`esVendedor`/`esAdmin`).
Orden: los usuarios más nuevos primero. La UI pagina (anterior/siguiente) para
llegar a **todos** los usuarios registrados.
`plan` filtra por el plan de la tienda del usuario — implica `esVendedor=true`
(un usuario sin tienda no puede tener plan). Paginado. Response `200`:
`{ data: UsuarioAdmin[]; page; pageSize; total }`.

### `PATCH /api/admin/usuarios/:id`

Request `{ esTester: boolean }`, `{ estadoCuenta: 'activa' | 'pausada' | 'baneada'; motivo?: string }`
o `{ plan: 'free' | 'premium' | 'plata' }` (plan del usuario, `18-alcance.md`).
Response `200`: `{ data: UsuarioAdmin }` (incluye `estadoCuenta`, `motivoSuspension`).
`400 ESTADO_CUENTA_INVALIDO` si `estadoCuenta` no es válido.
`400 PLAN_INVALIDO` si `plan` no es válido.

### `DELETE /api/admin/usuarios/:id`

Request `{ confirmacionEmail: string }`. Response `200`: `{ data: { id: string } }`.
`400 CONFIRMACION_INVALIDA` si el email no coincide; `409 ACCION_SOBRE_SI_MISMO`;
`403 FORBIDDEN` sobre otro admin; `404 USUARIO_NO_ENCONTRADO`.
`400 ES_TESTER_INVALIDO` si `esTester` no es booleano; `404 USUARIO_NO_ENCONTRADO`.

### `GET /api/admin/productos`

Query opcional `?tiendaId=&categoriaId=<uuid>&q=<texto>&page&pageSize` — mismos
filtros que `GET /api/tiendas/:tiendaId/productos` (`03-productos.md`) pero sin
`tiendaId` obligatorio: cruza productos de todas las tiendas. Paginado. Response
`200`: `{ data: ProductoAdmin[]; page; pageSize; total }`.

### Rubros y categorías

ABM de rubros de negocio y categorías de producto en `/admin/rubros-categorias`:
endpoints, reglas y errores en `17-rubros-categorias.md`.

### `GET /api/admin/ventas`

Query opcional `?tiendaId=&compradorId=&page&pageSize` — mismo shape que
`GET /api/tiendas/:tiendaId/ventas` (`05-ventas.md`) pero sin exigir ser el dueño
de la tienda: cruza ventas de todas las tiendas. Paginado. Response `200`:
`{ data: VentaAdmin[]; page; pageSize; total }`.

## Firmas de funciones/clases TypeScript

Ubicación: `src/lib/admin/`.

```ts
interface RangoFechas {
  desde?: string; // ISO date
  hasta?: string;
}

interface Metricas {
  ventas: { cantidad: number; totalFacturado: number };
  pedidos: Record<string, number>;
  tiendasNuevas: number;
  tiendasDadasDeBaja: number;
  usuariosNuevos: number;
}

async function obtenerMetricas(admin: Usuario, rango: RangoFechas): Promise<Metricas>;

interface ListarSolicitudesVerificacionInput {
  estado?: EstadoVerificacion; // default 'pendiente'
  page?: number;
  pageSize?: number;
}

async function listarSolicitudesVerificacion(
  admin: Usuario,
  input: ListarSolicitudesVerificacionInput
): Promise<{ data: SolicitudVerificacion[]; page: number; pageSize: number; total: number }>;

type RolUsuario = 'comprador' | 'vendedor' | 'admin';

interface UsuarioAdmin extends Usuario {
  plan: Plan; // plan del usuario (18-alcance.md)
  tiendas: Array<{ id: string; nombre: string; plan: Plan; verificada: boolean }>; // propias (19-equipo-tienda.md)
  cantidadVentas: number; // con tiendas: ventas cobradas de todas; sin tienda: compras propias
}

interface ListarUsuariosInput {
  rol?: RolUsuario;
  plan?: Plan;
  page?: number;
  pageSize?: number;
}

async function listarUsuarios(
  admin: Usuario,
  input: ListarUsuariosInput
): Promise<{ data: UsuarioAdmin[]; page: number; pageSize: number; total: number }>;

interface ProductoAdmin extends Producto {
  tiendaNombre: string;
  vendedorNombre: string;
}

interface ListarProductosAdminInput {
  tiendaId?: string;
  categoriaId?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}

async function listarProductosAdmin(
  admin: Usuario,
  input: ListarProductosAdminInput
): Promise<{ data: ProductoAdmin[]; page: number; pageSize: number; total: number }>;

interface ItemVentaAdmin {
  id: string;
  productoId: string;
  productoNombre: string;
  cantidad: number;
  precioUnitario: number;
}

interface VentaAdmin extends Omit<Venta, 'items'> {
  tiendaNombre: string;
  items: ItemVentaAdmin[];
}

interface ListarVentasAdminInput {
  tiendaId?: string;
  compradorId?: string;
  page?: number;
  pageSize?: number;
}

async function listarVentasAdmin(
  admin: Usuario,
  input: ListarVentasAdminInput
): Promise<{ data: VentaAdmin[]; page: number; pageSize: number; total: number }>;
```

## Configuración del sistema

Parámetros de negocio editables por un admin sin redeploy (ej. umbrales de
gamificación, costo por km del itinerario). No tienen UI de alta libre: el código
define qué claves existen y su valor por defecto (`CLAVES_CONFIG` en
`src/lib/config/config.ts`); la tabla solo guarda los valores sobrescritos.

```sql
CREATE TABLE configuracion_sistema (
  clave          TEXT PRIMARY KEY,
  valor          JSONB NOT NULL,
  actualizada_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Claves actuales:

| Clave | Tipo | Default | Usada por |
|---|---|---|---|
| `gamificacion.umbral_items_compra_extra` | entero ≥ 0 | `5` | `12-gamificacion.md` (`visita_compra`) |
| `itinerario.costo_km` | número ≥ 0 (ARS por km) | `300` | `15-itinerario.md` |
| `gamificacion.porcentaje_puntos_equipo` | entero 0–100 | `50` | `12-gamificacion.md` (reparto de `venta_realizada` con el equipo; cada tienda puede pisarlo) |

### `GET /api/admin/config`

Response `200`: `{ data: Array<{ clave: string; valor: number; porDefecto: number; descripcion: string }> }`.

### `PATCH /api/admin/config`

Request: `{ clave: string; valor: number }`. Response `200`: el mismo item actualizado.

```ts
// Ubicación: src/lib/config/config.ts
type ClaveConfig = 'gamificacion.umbral_items_compra_extra' | 'itinerario.costo_km' | 'gamificacion.porcentaje_puntos_equipo';
async function obtenerConfig(clave: ClaveConfig): Promise<number>; // valor guardado o default
async function listarConfig(admin: Usuario): Promise<ItemConfig[]>;
async function actualizarConfig(admin: Usuario, clave: string, valor: number): Promise<ItemConfig>;
```

## Casos de error a contemplar

| Código             | Cuándo                                                    |
| -------------------- | --------------------------------------------------------------|
| `FORBIDDEN`          | Usuario autenticado sin `esAdmin = true`.                    |
| `RANGO_INVALIDO`     | `desde` > `hasta` en `obtenerMetricas`.                      |
| `CLAVE_CONFIG_INVALIDA` | `clave` no es una de `CLAVES_CONFIG`.                      |
| `VALOR_CONFIG_INVALIDO` | `valor` no es numérico, es negativo, o no es entero cuando la clave lo exige. |
