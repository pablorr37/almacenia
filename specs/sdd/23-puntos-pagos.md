# Módulo: puntos como medio de pago, transferencias, pagos en pesos y vencimiento del plan

Convenciones comunes: ver [`00-overview.md`](00-overview.md). Depende de
[`12-gamificacion.md`](12-gamificacion.md), [`18-alcance.md`](18-alcance.md),
[`10-planes.md`](10-planes.md), [`19-equipo-tienda.md`](19-equipo-tienda.md) y
[`11-admin.md`](11-admin.md). Lo usan [`21-publicidad.md`](21-publicidad.md) y
[`22-notificaciones.md`](22-notificaciones.md). Pedido del usuario: 2026-10-17, puntos 1 y 2, y
decisiones del 2026-10-23 en `docs/memoria.md` / `docs/rondas/ronda-4-publicidad.md`.

## Modelo de datos

```sql
CREATE TYPE renovacion_auto AS ENUM ('ninguna', 'puntos', 'pesos');
CREATE TYPE concepto_pago AS ENUM ('premium', 'publicidad');
CREATE TYPE estado_orden_pago AS ENUM ('pendiente', 'pagada', 'cancelada', 'vencida');

ALTER TABLE usuarios
  ADD COLUMN plan_vence_en   TIMESTAMPTZ NULL,           -- NULL = sin vencimiento (asignado por el admin)
  ADD COLUMN renovacion_auto renovacion_auto NOT NULL DEFAULT 'ninguna';

CREATE TABLE ordenes_pago (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id      UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  concepto        concepto_pago NOT NULL,
  referencia_id   UUID NULL,                    -- campaña (publicidad); NULL para premium
  monto_ars       NUMERIC(12, 2) NOT NULL CHECK (monto_ars >= 0),
  estado          estado_orden_pago NOT NULL DEFAULT 'pendiente',
  proveedor       TEXT NOT NULL DEFAULT 'manual', -- adaptador de ProcesadorPagos
  external_id     TEXT NULL,                    -- id del pago en el proveedor (Mercado Pago, etc.)
  detalle         JSONB NULL,                   -- { dias } u otros datos del concepto
  creada_en       TIMESTAMPTZ NOT NULL DEFAULT now(),
  pagada_en       TIMESTAMPTZ NULL,
  confirmada_por  UUID NULL REFERENCES usuarios(id) ON DELETE SET NULL
);
CREATE INDEX ON ordenes_pago (estado, creada_en DESC);
CREATE INDEX ON ordenes_pago (usuario_id);
```

Los gastos y movimientos de puntos son filas de `eventos_puntos` (12-gamificacion.md) con estos tipos:

| Tipo | Signo | Cuenta como "ganado" | Qué es |
| --- | --- | --- | --- |
| `canje_premium` | − | — | Canje de premium con puntos (manual o renovación automática). |
| `canje_publicidad` | − | — | Pago de una campaña de publicidad con puntos (21-publicidad.md). |
| `reintegro_publicidad` | + | **No** | Devolución de días no usados de una campaña finalizada antes de tiempo. |
| `transferencia_enviada` | − | — | Puntos transferidos a otro miembro de la tienda. |
| `transferencia_recibida` | + | **No** | Puntos recibidos de otro miembro de la tienda. |

## Reglas de negocio

### Saldo y puntos ganados
- **Saldo** (`saldoPuntos`) = suma de todos los eventos del usuario (ganados − gastados ± transferencias). Es lo que se puede gastar.
- **Ganados** (`puntosGanados`) = suma de los eventos **positivos**, excluyendo `transferencia_recibida` y `reintegro_publicidad`.
  - El **radio de alcance** (18-alcance.md) usa los ganados: **canjear no achica el radio**, y transferir no lo infla.
- `totalPuntos` queda como alias de `saldoPuntos` (compatibilidad).

### Canje atómico
- Todo gasto de puntos corre en **una transacción** que:
  1. bloquea la fila del usuario (`SELECT … FROM usuarios WHERE id = $1 FOR UPDATE`), así dos canjes simultáneos no gastan dos veces el mismo saldo;
  2. calcula el saldo;
  3. si no alcanza, aborta con `409 PUNTOS_INSUFICIENTES`;
  4. inserta el evento negativo y aplica el beneficio en la misma transacción.

### Precios (todo calibrable en el admin, `CLAVES_CONFIG`)

| Clave | Por defecto | Qué es |
| --- | --- | --- |
| `canje.premium_puntos` | 1500 | Puntos para un período de premium. |
| `canje.premium_dias` | 30 | Días que dura un período de premium (con puntos o pesos). |
| `canje.publicidad_dia_puntos` | 100 | Puntos por día de campaña en un espacio de la app. |
| `canje.publicidad_pin_dia_puntos` | 50 | Puntos por día de "tienda destacada" en el mapa. |
| `canje.publicidad_push_puntos` | 300 | Puntos por un envío de publicidad push. |
| `canje.reintegro_pct` | 100 (máx. 100) | % de los puntos de días no usados que se devuelven al finalizar antes de tiempo. |
| `precio.premium_ars` | 3000 | Pesos por un período de premium. |
| `precio.publicidad_dia_ars` | 1000 | Pesos por día de campaña en un espacio de la app. |
| `precio.publicidad_pin_dia_ars` | 500 | Pesos por día de tienda destacada. |
| `precio.publicidad_push_ars` | 3000 | Pesos por un envío de publicidad push. |
| `puntos.transferencia_max` | 500 | Máximo de puntos por transferencia. |
| `puntos.transferencia_mes_max` | 2000 | Máximo de puntos que un usuario puede enviar por mes calendario (hora de San Juan). |
| `pagos.gracia_dias` | 3 | Días que se mantiene el premium vencido mientras espera el pago de la renovación en pesos. |

### Premium con puntos
- `canjearPremium(usuario)`:
  - **plata** → `409 PLAN_YA_SUPERIOR` (no tiene sentido bajar).
  - **premium sin vencimiento** (asignado por el admin) → `409 PLAN_SIN_VENCIMIENTO`.
  - **free** → pasa a premium con `plan_vence_en = ahora + canje.premium_dias`.
  - **premium con vencimiento** → se extiende desde el vencimiento actual (`plan_vence_en + días`).
  - El plan de sus tiendas se copia (como en `cambiarPlanUsuario`, 20-precios-facturacion.md).
  - Evento `canje_premium` con `metadata: { dias, venceEn }`.
- `configurarRenovacion(usuario, modo)` con `modo ∈ ninguna | puntos | pesos` (opt-in). Se puede elegir aunque hoy sea free; solo aplica cuando hay un plan con vencimiento.
- Cuando el admin asigna un plan a mano (`cambiarPlanUsuario`), `plan_vence_en` vuelve a NULL: el plan manual **no vence**.

### Vencimiento y renovación (`vencerPlanes(ahora)`, idempotente)
Recorre los usuarios con `plan_vence_en <= ahora`:
1. **Renovación por puntos** y saldo suficiente → canje (`canje_premium`, `metadata.renovacion = true`), `plan_vence_en += días`, notificación `plan_renovado`.
2. **Renovación por pesos**:
   - si no hay una orden `premium` pendiente para el usuario, se crea (y se notifica `plan_por_vencer` con el pedido de pago);
   - mientras `ahora < plan_vence_en + pagos.gracia_dias`, el plan se mantiene;
   - pasada la gracia, la orden pasa a `vencida` y el plan vuelve a free (paso 3).
3. **Sin renovación, o renovación por puntos sin saldo** → plan `free`, `plan_vence_en = NULL` (también en sus tiendas), notificación `plan_vencido`.

Además, los usuarios con premium que vence en los próximos 3 días reciben **una** notificación `plan_por_vencer` (deduplicada por vencimiento).

### Transferencias dentro del equipo
- `transferirPuntos(usuario, { tiendaId, aUsuarioId, puntos })`:
  - **ambos** tienen que ser propietario o miembro de **la misma** `tiendaId` (`accesoATienda`); si no, `403 NO_ES_DEL_EQUIPO`;
  - no a uno mismo (`409 ACCION_SOBRE_SI_MISMO`);
  - `puntos` > 0 con a lo sumo 1 decimal (`400 PUNTOS_INVALIDOS`);
  - `puntos <= puntos.transferencia_max` (`409 TOPE_TRANSFERENCIA`);
  - lo enviado en el mes + `puntos <= puntos.transferencia_mes_max` (`409 TOPE_TRANSFERENCIA_MES`);
  - saldo suficiente (`409 PUNTOS_INSUFICIENTES`), con el bloqueo del canje atómico.
- Inserta `transferencia_enviada` (−) y `transferencia_recibida` (+), ambos con `tienda_id` y la contraparte. Notifica `transferencia_recibida` al destinatario.
- Cualquier miembro puede transferir (no hace falta un permiso).

### Pagos en pesos (infraestructura lista para ampliar)
- Todo cobro en pesos es una **orden de pago** (`ordenes_pago`). El monto sale de las claves `precio.*`.
- Interfaz `ProcesadorPagos` (mismo patrón que `Facturador`, 20-precios-facturacion.md):
  - `nombre`;
  - `iniciar(orden)` → `{ instrucciones: string; urlPago: string | null }`.
- Adaptador actual: **`PagoManual`** (`proveedor = 'manual'`). Instrucciones: transferir o pagar en efectivo indicando el código de la orden; un **admin** la confirma.
- Un adaptador de **Mercado Pago** (`MercadoPago`, pendiente) devolvería `urlPago` (checkout) y confirmaría por webhook (`POST /api/pagos/webhook/:proveedor`), llamando a la misma `aplicarOrdenPagada`.
- `confirmarOrdenManual(admin, ordenId)`: solo `pendiente` (`409 ORDEN_NO_PENDIENTE`); pasa a `pagada` con `pagada_en`, `confirmada_por`, y aplica el beneficio con `aplicarOrdenPagada`:
  - `premium` → igual que el canje: free pasa a premium por `días`; premium con vencimiento se extiende; notificación `pago_confirmado`;
  - `publicidad` → la campaña referida pasa de `pendiente_pago` a `en_moderacion` (21-publicidad.md).
- `cancelarOrden(usuario|admin, ordenId)`: el dueño de la orden o un admin, solo si está pendiente. Si era de una campaña, la campaña queda `finalizada`.
- Una orden por usuario y concepto `premium` pendiente a la vez (`409 ORDEN_PENDIENTE_EXISTE`).

## Endpoints REST

### `GET /api/gamificacion/puntos`
`{ data: { total, saldo, ganados } }` (`total` = `saldo`, por compatibilidad).

### `GET /api/puntos/precios`
Precios vigentes, para la UI: `{ premiumPuntos, premiumDias, premiumArs, publicidad: { [espacio]: { puntos, ars, unidad: 'dia' | 'envio' } }, transferenciaMax, transferenciaMesMax }`. Público con sesión.

### `GET /api/puntos/plan`
`{ plan, planVenceEn, renovacionAuto, ordenPendiente: OrdenPago | null }` del usuario actual.

### `POST /api/puntos/canjes/premium`
Canjea premium con puntos. `200 { data: { plan, planVenceEn, saldo } }`.

### `PUT /api/puntos/renovacion`
Body `{ modo: 'ninguna' | 'puntos' | 'pesos' }`.

### `POST /api/puntos/transferencias`
Body `{ tiendaId, aUsuarioId, puntos }`. `201 { data: { saldo } }`.

### `GET /api/puntos/equipo?tiendaId=`
Personas a las que el usuario puede transferir en esa tienda (propietario y miembros, sin él). Exige ser del equipo.

### `POST /api/pagos/ordenes`
Body `{ concepto: 'premium' }` (las de publicidad se crean al crear la campaña). `201 { data: { orden, instrucciones, urlPago } }`.

### `GET /api/pagos/ordenes`
Órdenes del usuario actual.

### `DELETE /api/pagos/ordenes/:id`
Cancela una orden pendiente propia.

### Admin
- `GET /api/admin/pagos?estado=` — paginado, con el usuario.
- `POST /api/admin/pagos/:id/confirmar` — confirma una orden manual.
- `POST /api/admin/pagos/:id/cancelar`.

### Tareas programadas: `POST /api/cron/tareas`
- Header `Authorization: Bearer <CRON_TOKEN>`; sin `CRON_TOKEN` configurado responde `503 CRON_NO_CONFIGURADO`, con token incorrecto `401 NO_AUTENTICADO`.
- Ejecuta, cada una en su `sinRomper`: `vencerPlanes`, `actualizarDiasCampanias` (21), `procesarEnvios` y `procesarPublicidadPush` (22).
- Se programa en Coolify **cada hora** (las tareas son idempotentes; la publicidad push necesita correr dentro de la franja horaria).

## Firmas de funciones/clases TypeScript

```ts
// src/lib/gamificacion/gamificacion.ts
export const TIPOS_NO_GANADOS: readonly string[]; // transferencia_recibida, reintegro_publicidad
export function saldoPuntos(usuarioId: string): Promise<number>;
export function puntosGanados(usuarioId: string): Promise<number>;

// src/lib/puntos/canjes.ts
export function gastarPuntos(
  tx: Prisma.TransactionClient, usuarioId: string, tipo: string, puntos: number,
  opciones?: { tiendaId?: string | null; contraparteUsuarioId?: string | null; metadata?: Record<string, unknown> }
): Promise<{ saldo: number }>; // dentro de una transacción; bloquea al usuario
export function canjearPremium(usuario: Usuario, ahora?: Date): Promise<{ plan: Plan; planVenceEn: string; saldo: number }>;
export function extenderPremium(tx: Prisma.TransactionClient, usuarioId: string, dias: number, ahora: Date): Promise<Date>;
export function configurarRenovacion(usuario: Usuario, modo: RenovacionAuto): Promise<{ renovacionAuto: RenovacionAuto }>;
export function vencerPlanes(ahora?: Date): Promise<{ renovados: number; vencidos: number; enGracia: number; avisados: number }>;

// src/lib/puntos/transferencias.ts
export function transferirPuntos(usuario: Usuario, input: { tiendaId: string; aUsuarioId: string; puntos: number }, ahora?: Date): Promise<{ saldo: number }>;
export function equipoParaTransferir(usuario: Usuario, tiendaId: string): Promise<Array<{ id: string; nombre: string }>>;

// src/lib/puntos/precios.ts
export function preciosVigentes(): Promise<PreciosVigentes>;

// src/lib/pagos/procesador.ts
export interface ProcesadorPagos { nombre: string; iniciar(orden: OrdenPago): Promise<{ instrucciones: string; urlPago: string | null }> }
export class PagoManual implements ProcesadorPagos {}
export function procesadorActivo(): ProcesadorPagos;

// src/lib/pagos/ordenes.ts
export function crearOrdenPago(usuarioId: string, input: { concepto: ConceptoPago; referenciaId?: string; montoArs: number; detalle?: Record<string, unknown> }, tx?): Promise<OrdenPago>;
export function crearOrdenPremium(usuario: Usuario): Promise<{ orden: OrdenPago; instrucciones: string; urlPago: string | null }>;
export function listarMisOrdenes(usuario: Usuario): Promise<OrdenPago[]>;
export function cancelarOrden(usuario: Usuario, ordenId: string): Promise<OrdenPago>;
export function listarOrdenesAdmin(admin: Usuario, filtros: { estado?: EstadoOrdenPago; page?: number; pageSize?: number }): Promise<Paginado<OrdenPagoAdmin>>;
export function confirmarOrdenManual(admin: Usuario, ordenId: string, ahora?: Date): Promise<OrdenPago>;
export function aplicarOrdenPagada(ordenId: string, ahora?: Date): Promise<void>;
```

## Casos de error a contemplar

| Código | HTTP | Cuándo |
| --- | --- | --- |
| `PUNTOS_INSUFICIENTES` | 409 | El saldo no alcanza. |
| `PLAN_YA_SUPERIOR` | 409 | Canjear premium siendo plata. |
| `PLAN_SIN_VENCIMIENTO` | 409 | Canjear premium con un premium manual. |
| `RENOVACION_INVALIDA` | 400 | Modo de renovación desconocido. |
| `NO_ES_DEL_EQUIPO` | 403 | Transferir a o desde alguien que no es de la tienda. |
| `PUNTOS_INVALIDOS` | 400 | Puntos ≤ 0 o con más de un decimal. |
| `TOPE_TRANSFERENCIA` / `TOPE_TRANSFERENCIA_MES` | 409 | Superar el tope por transferencia o mensual. |
| `ORDEN_NO_ENCONTRADA` | 404 | — |
| `ORDEN_NO_PENDIENTE` | 409 | Confirmar o cancelar una orden que no está pendiente. |
| `ORDEN_PENDIENTE_EXISTE` | 409 | Ya hay una orden premium pendiente. |
| `CONCEPTO_INVALIDO` | 400 | — |
| `CRON_NO_CONFIGURADO` | 503 | Falta `CRON_TOKEN`. |
