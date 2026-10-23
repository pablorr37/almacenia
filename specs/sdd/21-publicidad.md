# Módulo: publicidad (motor de avisos propio, tienda destacada, publicidad push)

Convenciones comunes: ver [`00-overview.md`](00-overview.md). Depende de
[`23-puntos-pagos.md`](23-puntos-pagos.md) (cobro en puntos o pesos),
[`19-equipo-tienda.md`](19-equipo-tienda.md) (permiso `publicidad`),
[`08-archivos.md`](08-archivos.md), [`18-alcance.md`](18-alcance.md) y
[`22-notificaciones.md`](22-notificaciones.md) (publicidad push). Diseño de base:
`docs/investigacion/motor-de-avisos.md`; decisiones en `docs/rondas/ronda-4-publicidad.md`.

Fuera de alcance por ahora (decisión del 2026-10-23, punto 7): **Google y otros proveedores**. El
rotador devuelve solo avisos propios; la interfaz queda preparada para sumar proveedores con pesos
por espacio (ver "Proveedores externos").

## Modelo de datos

```sql
CREATE TYPE espacio_aviso AS ENUM ('inicio', 'lista', 'comparar', 'tienda_pie', 'pin_mapa', 'push');
CREATE TYPE estado_campania AS ENUM ('pendiente_pago', 'en_moderacion', 'activa', 'pausada', 'rechazada', 'finalizada');
CREATE TYPE pago_campania AS ENUM ('puntos', 'pesos');
CREATE TYPE tipo_pieza AS ENUM ('imagen', 'texto');
CREATE TYPE tipo_evento_aviso AS ENUM ('impresion', 'clic');

ALTER TYPE permiso_tienda ADD VALUE 'publicidad';

CREATE TABLE campanias_aviso (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tienda_id             UUID NOT NULL REFERENCES tiendas(id) ON DELETE CASCADE,
  creada_por_id         UUID NULL REFERENCES usuarios(id) ON DELETE SET NULL, -- quien pagó
  espacio               espacio_aviso NOT NULL,
  titulo                TEXT NOT NULL,              -- nombre interno de la campaña
  estado                estado_campania NOT NULL,
  desde                 DATE NOT NULL,              -- primer día (hora de San Juan)
  dias                  INTEGER NOT NULL CHECK (dias BETWEEN 1 AND 90), -- días pagados (push: 1 envío)
  dias_consumidos       INTEGER NOT NULL DEFAULT 0,
  ultimo_dia_consumido  DATE NULL,
  pago                  pago_campania NOT NULL,
  puntos_pagados        NUMERIC(8, 1) NULL,
  orden_pago_id         UUID NULL REFERENCES ordenes_pago(id) ON DELETE SET NULL,
  segmento              JSONB NULL,                 -- { radioKm?: number }
  peso                  INTEGER NOT NULL DEFAULT 1 CHECK (peso BETWEEN 1 AND 10),
  motivo_rechazo        TEXT NULL,
  enviada_en            TIMESTAMPTZ NULL,           -- push: cuándo salió
  creada_en             TIMESTAMPTZ NOT NULL DEFAULT now(),
  aprobada_en           TIMESTAMPTZ NULL,
  finalizada_en         TIMESTAMPTZ NULL
);
CREATE INDEX ON campanias_aviso (espacio, estado);
CREATE INDEX ON campanias_aviso (tienda_id);

CREATE TABLE piezas_aviso (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campania_id  UUID NOT NULL REFERENCES campanias_aviso(id) ON DELETE CASCADE,
  tipo         tipo_pieza NOT NULL,
  imagen_url   TEXT NULL,                 -- WebP (animado si venía de un GIF)
  ancho        INTEGER NULL,
  alto         INTEGER NULL,
  texto        TEXT NULL,                 -- pieza de texto / cuerpo del push
  destino      TEXT NULL,                 -- NULL = página de la tienda; si no, https://… o ruta interna /…
  creada_en    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE eventos_aviso (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campania_id  UUID NOT NULL REFERENCES campanias_aviso(id) ON DELETE CASCADE,
  pieza_id     UUID NULL REFERENCES piezas_aviso(id) ON DELETE SET NULL,
  tipo         tipo_evento_aviso NOT NULL,
  usuario_id   UUID NULL REFERENCES usuarios(id) ON DELETE SET NULL,
  nonce        TEXT NOT NULL,             -- del token: una impresión y un clic por entrega
  creado_en    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tipo, nonce)
);
CREATE INDEX ON eventos_aviso (campania_id, tipo, creado_en);
CREATE INDEX ON eventos_aviso (usuario_id, creado_en);
```

## Espacios

| Espacio | Dónde | Pieza | Cobro |
| --- | --- | --- | --- |
| `inicio` | Menú de inicio, debajo de "Comprar" | Imagen apaisada (proporción 2,5:1 a 7:1, p. ej. 320×100 o 320×50) o texto | Por día (`canje.publicidad_dia_puntos` / `precio.publicidad_dia_ars`) |
| `lista` | Lista de negocios cercanos | Ídem | Por día |
| `comparar` | Entre resultados de "Buscar y comparar" | Imagen casi cuadrada (1:1 a 1,5:1, p. ej. 300×250) o texto | Por día |
| `tienda_pie` | Pie de la página de una tienda | Imagen apaisada o texto | Por día |
| `pin_mapa` | Nombre junto al pin en el mapa ("Destacado") | Sin pieza (usa el nombre de la tienda) | Por día (`canje.publicidad_pin_dia_*`) |
| `push` | Notificación push de publicidad | Texto (título = nombre de la tienda, cuerpo = `texto`) | Por envío (`canje.publicidad_push_*`), `dias = 1` |

Reglas de ubicación (compatibilidad con el punto de venta y buenas prácticas de AdSense):
- **Nunca** en mi-tienda ni cerca de los botones de acción del punto de venta (Cobrar, Agregar, Escanear).
- A lo sumo un espacio por pantalla, con el **alto reservado** (sin saltos de diseño) y la etiqueta "Publicidad".

## Reglas de negocio

### Quién ve avisos
- Solo **usuarios free e invitados**. Premium y plata no ven avisos ni reciben publicidad push.
- No se le muestran a nadie los avisos de una tienda donde es propietario o miembro del equipo.

### Alta, pago y moderación
- Crea campañas el **propietario o un miembro con el permiso `publicidad`** (`exigirPermiso`). Paga **quien la crea**, con sus puntos o con una orden en pesos.
- Costo: `dias × precio por día del espacio` (push: el precio por envío).
- `desde` no puede ser anterior a hoy (`400 FECHA_INVALIDA`); `dias` entre 1 y 90 (`400 DIAS_INVALIDOS`).
- Pieza:
  - `imagen`: JPEG, PNG, WebP o **GIF** (hasta **1 MB** para avisos). Se valida la proporción del espacio (`400 PROPORCION_INVALIDA`) y se convierte a **WebP** (animado si es GIF) con `sharp`, ancho máximo 640 px;
  - `texto`: hasta 140 caracteres (`400 TEXTO_INVALIDO`);
  - `push` solo acepta texto; `pin_mapa` no lleva pieza;
  - `destino`: vacío (= página de la tienda), una ruta interna que empieza con `/` (no `//`) o una URL `https://` (`400 DESTINO_INVALIDO`).
- Pago con **puntos**: canje atómico (`canje_publicidad`, 23-puntos-pagos.md) y la campaña queda `en_moderacion`.
- Pago con **pesos**: se crea una orden (`concepto = 'publicidad'`, `referencia_id` = campaña) y la campaña queda `pendiente_pago`; al confirmarse la orden pasa a `en_moderacion`.
- **Moderación** (admin): aprobar → `activa` (`aprobada_en`); rechazar con motivo → `rechazada`, y si se pagó con puntos se **reintegran todos** (`reintegro_publicidad`). Si se pagó en pesos, el reintegro es manual (lo indica el admin). Se notifica `campania_aprobada` / `campania_rechazada` a quien la creó.

### Días de campaña
- Un día se **consume** cuando la campaña está activa ese día (hora de San Juan) y `desde <= hoy`.
- `actualizarDiasCampanias(ahora)` (idempotente; corre en la tarea programada, en el rotador y en la búsqueda de tiendas):
  1. finaliza las activas con `dias_consumidos >= dias` cuyo último día consumido es anterior a hoy;
  2. consume hoy en las activas con `desde <= hoy`, `dias_consumidos < dias` y `ultimo_dia_consumido` distinto de hoy.
- **Pausar** (`activa → pausada`) y **reanudar** (`pausada → activa`): los días pausados no se consumen. La push no se pausa (`409 TRANSICION_INVALIDA`).
- **Finalizar** antes de tiempo (desde `pendiente_pago`, `en_moderacion`, `activa` o `pausada`):
  - si estaba en `pendiente_pago`, se cancela su orden;
  - si se pagó con puntos: en `en_moderacion` se reintegra **todo**; en `activa`/`pausada` se reintegran los días no usados (`dias − dias_consumidos`) × precio por día pagado × `canje.reintegro_pct` %.

### Rotador (`elegirAviso`)
- Entrada: espacio, usuario (o invitado), ubicación opcional.
- Usuario con plan distinto de free → `null`.
- Candidatas: `estado = 'activa'`, `desde <= hoy`, día disponible (`dias_consumidos < dias` o ya consumido hoy), con al menos una pieza; fuera de las tiendas del usuario; si `segmento.radioKm` y hay ubicación, la tienda está dentro de ese radio.
- **Tope de frecuencia**: un usuario con sesión ve cada campaña a lo sumo `publicidad.frecuencia_dia` (3) impresiones por día.
- Sorteo **ponderado por `peso`**; se elige una pieza al azar de la campaña.
- Devuelve la pieza con un **token firmado** (HMAC-SHA256 con `AUTH_SECRET`; payload: campaña, pieza, espacio, usuario, nonce aleatorio y vencimiento de 1 hora).
- Sin candidatas: `null` (la UI muestra un aviso de la casa: "Publicitá tu negocio acá").

### Medición
- **Impresión**: el cliente la envía con `sendBeacon` cuando la pieza estuvo al menos 50 % visible durante 1 s. Se registra una sola por token (`UNIQUE (tipo, nonce)`).
- **Clic**: `GET /api/avisos/clic?token=` registra (una vez por token) y redirige con `302` al destino **de la pieza guardada** (nunca a una URL del request: sin redirecciones abiertas). Con token vencido o inválido redirige al inicio sin registrar.
- No se cuentan: tokens vencidos o inválidos, user-agents de bots (`bot|crawler|spider|preview|headless`).
- **Nunca** se dan puntos por ver o tocar avisos (política de AdSense, también para los propios).
- Métricas por campaña: impresiones, clics, CTR y días consumidos.

### Tienda destacada (`pin_mapa`)
- `buscarTiendasCercanas` devuelve `destacada: true` para tiendas con una campaña `pin_mapa` en curso, y las ordena primero.
- En el mapa:
  - usuarios **free** (e invitados) ven el **nombre junto al pin** con la etiqueta "Destacado";
  - **premium y plata** ven solo el nombre junto al pin, sin la etiqueta.

### Publicidad push
- Campaña `push` aprobada → se envía en la próxima corrida de `procesarPublicidadPush(ahora)` **dentro de la franja horaria** (`notif.hora_inicio` a `notif.hora_fin`, hora de San Juan).
- Destinatarios: usuarios activos, plan free, que **activaron** la categoría `publicidad` (opt-in, 22-notificaciones.md), fuera del equipo de la tienda, y que recibieron menos de `notif.publicidad_push_semana` (2) notificaciones de publicidad en los últimos 7 días.
- Al enviarse: `enviada_en`, `dias_consumidos = 1`, `estado = 'finalizada'`.

### Proveedores externos (preparado, en espera)
- `app/ads.txt/route.ts` sirve el contenido de la variable `ADS_TXT` (`404` si no está).
- El rotador tiene un punto de extensión (`PROVEEDORES_POR_ESPACIO`) con pesos por espacio; hoy solo existe `propio`.
- Páginas `/privacidad` y `/terminos`, `app/robots.ts` y aviso de cookies (aceptar o rechazar cookies publicitarias de terceros, guardado en el navegador) quedan listos para la revisión de AdSense.

## Endpoints REST

### Vendedor (mi-tienda)
- `GET /api/tiendas/:tiendaId/campanias` — campañas de la tienda con su pieza y métricas. Permiso `publicidad`.
- `POST /api/tiendas/:tiendaId/campanias` — `multipart/form-data`: `espacio`, `titulo`, `desde` (YYYY-MM-DD), `dias`, `pago` (`puntos|pesos`), `texto?`, `destino?`, `radioKm?`, `imagen?` (archivo). `201 { data: { campania, orden?: { orden, instrucciones, urlPago } } }`.
- `POST /api/campanias/:id/pausar`, `/reanudar`, `/finalizar` — permiso `publicidad` en su tienda.

### Público
- `GET /api/avisos?espacio=&lat=&lon=` — `{ data: AvisoEntregado | null }`. Sin sesión = invitado.
- `POST /api/avisos/impresion` — body `{ token }` (también acepta texto plano de `sendBeacon`). `204`.
- `GET /api/avisos/clic?token=` — `302`.

### Admin
- `GET /api/admin/campanias?estado=` — paginado, con la tienda, pieza y métricas.
- `POST /api/admin/campanias/:id/moderar` — `{ aprobar: boolean, motivo?: string }` (motivo obligatorio al rechazar).

## Firmas de funciones/clases TypeScript

```ts
// src/lib/publicidad/reglas.ts (puras, sin servidor; las usa también la UI)
export const ESPACIOS: readonly EspacioAviso[];
export const ETIQUETA_ESPACIO: Record<EspacioAviso, string>;
export function proporcionValida(espacio: EspacioAviso, ancho: number, alto: number): boolean;
export function destinoValido(destino: string | null | undefined): boolean;
export function elegirPonderado<T extends { peso: number }>(items: T[], azar?: () => number): T | null;
export function diasNoUsados(c: { dias: number; diasConsumidos: number }): number;

// src/lib/publicidad/token.ts
export function firmarToken(p: PayloadAviso): string;
export function verificarToken(token: string, ahora?: Date): PayloadAviso | null;

// src/lib/publicidad/campanias.ts
export function precioCampania(espacio: EspacioAviso, dias: number, pago: PagoCampania): Promise<number>;
export function crearCampania(usuario: Usuario, tiendaId: string, input: CrearCampaniaInput, ahora?: Date): Promise<{ campania: Campania; orden?: … }>;
export function listarCampaniasTienda(usuario: Usuario, tiendaId: string): Promise<Campania[]>;
export function pausarCampania(usuario: Usuario, id: string): Promise<Campania>;
export function reanudarCampania(usuario: Usuario, id: string): Promise<Campania>;
export function finalizarCampania(usuario: Usuario, id: string, ahora?: Date): Promise<Campania>;
export function moderarCampania(admin: Usuario, id: string, input: { aprobar: boolean; motivo?: string }, ahora?: Date): Promise<Campania>;
export function listarCampaniasAdmin(admin: Usuario, filtros): Promise<Paginado<Campania>>;
export function activarCampaniaPagada(tx, campaniaId: string): Promise<void>; // la llama aplicarOrdenPagada
export function actualizarDiasCampanias(ahora?: Date): Promise<{ consumidas: number; finalizadas: number }>;
export function tiendasDestacadas(tiendaIds: string[], ahora?: Date): Promise<Set<string>>;

// src/lib/publicidad/rotador.ts
export function elegirAviso(input: { espacio: EspacioAviso; usuarioId: string | null; lat?: number; lon?: number }, ahora?: Date): Promise<AvisoEntregado | null>;
export function registrarImpresion(token: string, userAgent: string | null, ahora?: Date): Promise<boolean>;
export function registrarClic(token: string, userAgent: string | null, ahora?: Date): Promise<string>; // URL de destino

// src/lib/publicidad/push.ts
export function procesarPublicidadPush(ahora?: Date): Promise<{ campanias: number; enviados: number }>;

// src/lib/publicidad/piezas.ts
export function procesarImagenAviso(espacio: EspacioAviso, buffer: Buffer, contentType: string): Promise<{ buffer: Buffer; ancho: number; alto: number }>;
```

## Casos de error a contemplar

| Código | HTTP | Cuándo |
| --- | --- | --- |
| `ESPACIO_INVALIDO` | 400 | Espacio desconocido. |
| `FECHA_INVALIDA` / `DIAS_INVALIDOS` | 400 | `desde` pasado o mal formado; días fuera de 1–90. |
| `PIEZA_REQUERIDA` | 400 | Falta imagen o texto (salvo `pin_mapa`). |
| `PROPORCION_INVALIDA` | 400 | La imagen no tiene la proporción del espacio. |
| `TIPO_ARCHIVO_INVALIDO` / `ARCHIVO_DEMASIADO_GRANDE` | 400 | Formato no aceptado o más de 1 MB. |
| `DESTINO_INVALIDO` | 400 | Destino que no es `https://` ni ruta interna. |
| `PAGO_INVALIDO` | 400 | — |
| `CAMPANIA_NO_ENCONTRADA` | 404 | — |
| `TRANSICION_INVALIDA` | 409 | Pausar/reanudar/finalizar/moderar desde un estado que no lo permite. |
| `MOTIVO_REQUERIDO` | 400 | Rechazar sin motivo. |
| `PUNTOS_INSUFICIENTES` | 409 | 23-puntos-pagos.md. |
| `SIN_PERMISO` | 403 | Sin el permiso `publicidad`. |
