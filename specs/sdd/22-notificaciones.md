# Módulo: notificaciones (centro en la app, Web Push y email)

Convenciones comunes: ver [`00-overview.md`](00-overview.md). Depende de
[`04-pedidos.md`](04-pedidos.md), [`19-equipo-tienda.md`](19-equipo-tienda.md),
[`23-puntos-pagos.md`](23-puntos-pagos.md) y [`21-publicidad.md`](21-publicidad.md). Pedido del
usuario: 2026-10-17, punto 3; decisiones del 2026-10-23 (también por **email**; publicidad push con
tope de **2 por semana** y **sin envíos de noche**). Borrador: `docs/rondas/ronda-5-notificaciones.md`.

## Modelo de datos

```sql
CREATE TYPE estado_envio AS ENUM ('enviando', 'enviado', 'cancelado');

CREATE TABLE notificaciones (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id  UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo        TEXT NOT NULL,             -- ver catálogo; libre como eventos_puntos.tipo
  titulo      TEXT NOT NULL,
  cuerpo      TEXT NOT NULL,
  url         TEXT NULL,                 -- ruta interna a la que lleva al tocarla
  tienda_id   UUID NULL REFERENCES tiendas(id) ON DELETE CASCADE,
  clave_unica TEXT NULL UNIQUE,          -- deduplicación (p. ej. una oferta por tienda y día)
  en_app      BOOLEAN NOT NULL DEFAULT true, -- false = solo se mandó por push/email
  leida_en    TIMESTAMPTZ NULL,
  creada_en   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON notificaciones (usuario_id, creada_en DESC);
CREATE INDEX ON notificaciones (usuario_id, tipo, creada_en);

CREATE TABLE suscripciones_push (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id  UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  endpoint    TEXT NOT NULL UNIQUE,
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  user_agent  TEXT NULL,
  creada_en   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE preferencias_notificacion (
  usuario_id  UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  categoria   TEXT NOT NULL,
  en_app      BOOLEAN NOT NULL,
  push        BOOLEAN NOT NULL,
  email       BOOLEAN NOT NULL,
  PRIMARY KEY (usuario_id, categoria)
);

-- Envíos masivos del admin (avisos internos y generales).
CREATE TABLE envios_notificacion (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria          TEXT NOT NULL,      -- 'avisos'
  tipo               TEXT NOT NULL,      -- 'aviso_interno' | 'general'
  titulo             TEXT NOT NULL,
  cuerpo             TEXT NOT NULL,
  url                TEXT NULL,
  segmento           JSONB NOT NULL,     -- { roles?: ('comprador'|'vendedor')[], planes?: Plan[], tiendaId?: string, usuarioIds?: string[] }
  estado             estado_envio NOT NULL DEFAULT 'enviando',
  total              INTEGER NOT NULL,   -- destinatarios al crearlo
  enviados           INTEGER NOT NULL DEFAULT 0,
  ultimo_usuario_id  UUID NULL,          -- cursor del procesamiento por lotes
  creado_por_id      UUID NULL REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_en          TIMESTAMPTZ NOT NULL DEFAULT now(),
  terminado_en       TIMESTAMPTZ NULL
);
```

## Catálogo

Las preferencias van **por categoría y por canal** (app, push, email).

| Categoría | Tipos | Destinatarios | Por defecto (app / push / email) |
| --- | --- | --- | --- |
| `pedidos` | `pedido_nuevo`, `pedido_cancelado`, `pedido_modificado`, `pedido_estado`, `pedido_ajuste` | Ver "Disparadores" | ✓ / ✓ / ✗ |
| `cuenta` | `plan_por_vencer`, `plan_vencido`, `plan_renovado`, `pago_confirmado`, `transferencia_recibida`, `campania_aprobada`, `campania_rechazada` | El usuario | ✓ / ✓ / ✗ |
| `avisos` | `aviso_interno`, `general` | Segmento del admin | ✓ / ✓ / ✗ |
| `ofertas` | `oferta` | Compradores que ya interactuaron con la tienda | ✓ / ✓ / ✗ |
| `publicidad` | `publicidad` | Compradores free | ✓ / ✓ / ✗ |
| `chat` | `mensaje_chat` | Ver 24-chat.md | ✓ / ✓ / ✗ |

- **Desde la ronda 6 (pedido del 2026-10-26), todo viene activado en la app y en push; el email viene apagado.** Quien no quiera una categoría la desactiva.
  - La migración borra las preferencias guardadas que eran iguales a los defaults viejos (ofertas y publicidad todo apagado), para que tomen los nuevos.
- **Pausa global:** `usuarios.notificaciones_pausadas_hasta` (NULL = sin pausa). Mientras dura, las notificaciones se guardan en la app, pero no salen por push ni por email. Opciones de la UI: 1 hora, hasta mañana a las 8 (hora de San Juan) o indefinida (año 2100). Endpoints: `PUT /api/notificaciones/pausa` con `{ hasta: ISO | null }` y `GET /api/notificaciones/pausa`.
- Premium y plata **no** reciben `publicidad` aunque la tengan activa. La publicidad push mantiene su tope semanal y su franja horaria.
- La UI del perfil muestra "Publicidad" solo a usuarios free.

## Reglas de negocio

### Núcleo: `notificar(usuarioIds, notificacion)`
- Para cada destinatario resuelve sus preferencias de la categoría (fila guardada o default).
- Si los tres canales están apagados, no hace nada.
- Si `en_app` está activo o hay otro canal activo, **guarda** la fila en `notificaciones` (con `en_app` según la preferencia: así el tope de publicidad y la deduplicación cuentan también lo enviado solo por push o email). Con `clave_unica` ya usada no hace nada.
- **Push**: a cada suscripción del usuario con `web-push`. Si responde `404` o `410`, la suscripción se borra.
  - **Urgencia** (header `Urgency` de Web Push), por categoría. Con `normal`, Android en reposo (Doze) no despierta el teléfono y el aviso llega recién al abrir Chrome:

    | Categoría | Urgencia | TTL |
    | --- | --- | --- |
    | `pedidos` | `high` | 1 hora (un aviso de pedido viejo no sirve) |
    | `cuenta` | `high` | 24 horas |
    | `chat` | `high` | 1 hora |
    | `avisos` | `normal` | 24 horas |
    | `ofertas`, `publicidad` | `low` | 24 horas (no despiertan el teléfono; Chrome penaliza abusar de `high`) |
- **Email**: con `nodemailer` por SMTP a `usuarios.email`, con el título como asunto y un enlace a la URL.
- Canales **deshabilitados por configuración**: sin `NEXT_PUBLIC_VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` no hay push; sin `SMTP_HOST` no hay email. Solo se loguea una vez; no rompe nada.
- Los errores de envío **nunca** rompen la operación que notifica: los disparadores llaman a `notificar` dentro de `sinRomper`. El envío de push/email se hace después de guardar y sus errores solo se loguean.
- Usuarios no activos (pausados o baneados) no reciben nada.

### Disparadores
| Tipo | Cuándo | A quién |
| --- | --- | --- |
| `pedido_nuevo` | `crearPedido` | Propietario y miembros con permiso `pedidos` |
| `pedido_cancelado` | El comprador cancela | Propietario y miembros con permiso `pedidos` |
| `pedido_modificado` | Alguien del equipo cambia el estado (confirmar, rechazar, listo, entregar) | El resto del equipo con permiso `pedidos` (no quien lo hizo) |
| `pedido_estado` | Ídem | El comprador |
| `plan_*`, `pago_confirmado` | 23-puntos-pagos.md | El usuario |
| `transferencia_recibida` | 23-puntos-pagos.md | Quien recibe |
| `campania_aprobada`/`_rechazada` | 21-publicidad.md | Quien creó la campaña |
| `oferta` | `actualizarProducto` pone o cambia `precioOferta` (no null, menor que el precio) | Compradores (no del equipo) con una venta, check-in o visita a la página de esa tienda; **una por tienda por día** por comprador (`clave_unica = oferta:<tienda>:<usuario>:<día>`) |
| `publicidad` | 21-publicidad.md (`procesarPublicidadPush`) | Ver allá: free que no la desactivaron, tope semanal, franja horaria |
| `aviso_interno`, `general` | Envío del admin | Segmento |

Las firmas de `crearPedido`, `transicionarPedido` y `actualizarProducto` no cambian.

### Envíos masivos del admin
- `crearEnvio(admin, { tipo, titulo, cuerpo, url?, segmento })`:
  - `tipo ∈ aviso_interno | general`; `titulo` hasta 80, `cuerpo` hasta 300;
  - `segmento.roles` (comprador/vendedor), `segmento.planes`, `segmento.tiendaId` (equipo y dueño de esa tienda), `segmento.usuarioIds` (envío dirigido); vacío = todos los usuarios activos;
  - calcula `total`, procesa el **primer lote** en el request y deja el resto para la tarea programada.
- `contarSegmento(admin, segmento)` para la vista previa del conteo.
- `procesarEnvios(lote = 500)`: avanza cada envío `enviando` por `ultimo_usuario_id` (orden por id); al terminar, `enviado`.
- `cancelarEnvio(admin, id)`: solo `enviando`.

### PWA y Web Push
- `app/manifest.ts` (nombre, íconos, `display: standalone`, `start_url: /`).
- `public/sw.js`: evento `push` (muestra la notificación con `title`, `body`, `url`) y `notificationclick` (abre o enfoca la URL).
- Suscripción desde el perfil o la campanita, **después de que la persona toca un botón**:
  - registra el service worker, pide permiso y llama a `PushManager.subscribe` con la clave VAPID pública;
  - **iOS**: push solo funciona con la app instalada en la pantalla de inicio (iOS 16.4+). Si es iOS y no está en modo standalone, se muestra el instructivo "Compartir → Agregar a inicio".

### Centro de notificaciones (UI)
- **Campanita** con el contador de no leídas en el menú de inicio y en el mapa (se refresca al volver a la pestaña).
- `/notificaciones`: lista paginada (solo `en_app = true`), tocar marca como leída y navega a la URL; "Marcar todas como leídas".
- Preferencias en el perfil: tabla de categorías × canales, más el botón para activar push en este dispositivo.

## Endpoints REST

- `GET /api/notificaciones?page=` — paginado, del usuario actual.
- `GET /api/notificaciones/no-leidas` — `{ data: { cantidad } }`.
- `POST /api/notificaciones/:id/leida` — `204`.
- `POST /api/notificaciones/leer-todas` — `204`.
- `GET /api/notificaciones/preferencias` — `{ data: Array<{ categoria, enApp, push, email }> }` (con defaults).
- `PUT /api/notificaciones/preferencias` — body `{ categoria, enApp, push, email }`.
- `GET /api/push/clave` — `{ data: { clavePublica: string | null } }`.
- `POST /api/push/suscripcion` — body `PushSubscriptionJSON` (`endpoint`, `keys.p256dh`, `keys.auth`). Si el endpoint ya existe, se reasigna al usuario actual.
- `DELETE /api/push/suscripcion` — body `{ endpoint }`.
- Admin:
  - `GET /api/admin/envios` — lista.
  - `POST /api/admin/envios/contar` — `{ segmento }` → `{ cantidad }`.
  - `POST /api/admin/envios` — crea y empieza a enviar.
  - `POST /api/admin/envios/:id/cancelar`.

## Firmas de funciones/clases TypeScript

```ts
// src/lib/notificaciones/catalogo.ts (puro)
export type Categoria = 'pedidos' | 'cuenta' | 'avisos' | 'ofertas' | 'publicidad';
export const CATEGORIAS: readonly Categoria[];
export const CATEGORIA_POR_TIPO: Record<string, Categoria>;
export const PREFERENCIA_POR_DEFECTO: Record<Categoria, { enApp: boolean; push: boolean; email: boolean }>;
export const ETIQUETA_CATEGORIA: Record<Categoria, string>;

// src/lib/notificaciones/canales.ts
export interface CanalPush { habilitado(): boolean; enviar(sub, payload): Promise<'ok' | 'expirada' | 'error'> }
export interface CanalEmail { habilitado(): boolean; enviar(para: string, asunto: string, texto: string, html: string): Promise<void> }
export function canales(): { push: CanalPush; email: CanalEmail };
export function reemplazarCanalesParaTests(c: Partial<{ push: CanalPush; email: CanalEmail }> | null): void;

// src/lib/notificaciones/notificar.ts
export function notificar(usuarioIds: string[], n: { tipo: string; titulo: string; cuerpo: string; url?: string; tiendaId?: string; claveUnica?: string }): Promise<{ guardadas: number }>;
export function destinatariosPedidos(tiendaId: string, excepto?: string): Promise<string[]>;

// src/lib/notificaciones/notificaciones.ts
export function listarNotificaciones(usuario: Usuario, p: { page?: number; pageSize?: number }): Promise<Paginado<Notificacion>>;
export function contarNoLeidas(usuario: Usuario): Promise<number>;
export function marcarLeida(usuario: Usuario, id: string): Promise<void>;
export function marcarTodasLeidas(usuario: Usuario): Promise<void>;
export function obtenerPreferencias(usuario: Usuario): Promise<Preferencia[]>;
export function guardarPreferencia(usuario: Usuario, p: Preferencia): Promise<Preferencia>;
export function guardarSuscripcion(usuario: Usuario, sub: { endpoint: string; keys: { p256dh: string; auth: string } }, userAgent?: string | null): Promise<void>;
export function borrarSuscripcion(usuario: Usuario, endpoint: string): Promise<void>;

// src/lib/notificaciones/disparadores.ts
export function notificarPedidoNuevo(pedidoId: string): Promise<void>;
export function notificarCambioPedido(pedidoId: string, actorId: string, accion: AccionPedido): Promise<void>;
export function notificarOferta(productoId: string, ahora?: Date): Promise<number>;

// src/lib/notificaciones/envios.ts
export function contarSegmento(admin: Usuario, segmento: Segmento): Promise<number>;
export function crearEnvio(admin: Usuario, input: CrearEnvioInput): Promise<Envio>;
export function listarEnvios(admin: Usuario): Promise<Envio[]>;
export function cancelarEnvio(admin: Usuario, id: string): Promise<Envio>;
export function procesarEnvios(lote?: number): Promise<{ enviados: number }>;

// src/lib/notificaciones/horario.ts (puro)
export function dentroDeFranja(ahora: Date, horaInicio: number, horaFin: number): boolean; // hora de San Juan
```

## Variables de entorno

| Variable | Para qué |
| --- | --- |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (`mailto:…`) | Web Push. Se generan una vez (`npx web-push generate-vapid-keys`) y no se cambian. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` | Email. |
| `APP_URL` | URL pública para los enlaces de los emails (p. ej. `https://almacenia.store`). |

## Casos de error a contemplar

| Código | HTTP | Cuándo |
| --- | --- | --- |
| `NOTIFICACION_NO_ENCONTRADA` | 404 | No existe o es de otro usuario. |
| `CATEGORIA_INVALIDA` | 400 | — |
| `SUSCRIPCION_INVALIDA` | 400 | Falta `endpoint` o las claves, o el endpoint no es `https://`. |
| `ENVIO_INVALIDO` | 400 | Tipo, título o cuerpo inválidos. |
| `ENVIO_NO_ENCONTRADO` | 404 | — |
| `TRANSICION_INVALIDA` | 409 | Cancelar un envío terminado. |
