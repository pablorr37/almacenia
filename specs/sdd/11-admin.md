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
- Revisar una solicitud de verificación (aprobar/rechazar) es la única escritura
  de este módulo, delegada a `revisarSolicitudVerificacion` (`02-tiendas.md`).

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
Paginado. Response `200`: `{ data: SolicitudVerificacion[]; page; pageSize; total }`.

### `PATCH /api/admin/verificaciones/:id`

Request: `{ decision: 'aprobada' | 'rechazada'; notaAdmin?: string }`. Delegado a
`revisarSolicitudVerificacion` (`02-tiendas.md`). Response `200`:
`{ data: SolicitudVerificacion }`.

### `PATCH /api/admin/tiendas/:id/plan`

Ver `10-planes.md`.

### `GET /api/admin/usuarios`

Query opcional `?rol=comprador|vendedor|admin&plan=free|premium&page&pageSize`.
`rol` filtra por el flag correspondiente (`esComprador`/`esVendedor`/`esAdmin`).
`plan` filtra por el plan de la tienda del usuario — implica `esVendedor=true`
(un usuario sin tienda no puede tener plan). Paginado. Response `200`:
`{ data: UsuarioAdmin[]; page; pageSize; total }`.

### `GET /api/admin/productos`

Query opcional `?tiendaId=&categoria=<Categoria>&q=<texto>&page&pageSize` — mismos
filtros que `GET /api/tiendas/:tiendaId/productos` (`03-productos.md`) pero sin
`tiendaId` obligatorio: cruza productos de todas las tiendas. Paginado. Response
`200`: `{ data: ProductoAdmin[]; page; pageSize; total }`.

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
  tienda: { id: string; nombre: string; plan: Plan; verificada: boolean } | null;
  cantidadVentas: number; // vendedor: ventas de su tienda; sin tienda: compras propias
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
  categoria?: Categoria;
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

## Casos de error a contemplar

| Código             | Cuándo                                                    |
| -------------------- | --------------------------------------------------------------|
| `FORBIDDEN`          | Usuario autenticado sin `esAdmin = true`.                    |
| `RANGO_INVALIDO`     | `desde` > `hasta` en `obtenerMetricas`.                      |
