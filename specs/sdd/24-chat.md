# Módulo: chat entre comprador y tienda

Convenciones comunes: ver [`00-overview.md`](00-overview.md). Depende de
[`04-pedidos.md`](04-pedidos.md) (pedidos y ajustes de peso), [`05-ventas.md`](05-ventas.md),
[`19-equipo-tienda.md`](19-equipo-tienda.md) y [`22-notificaciones.md`](22-notificaciones.md).
Pedido del usuario del 2026-10-26 (ver `docs/memoria.md`).

## Modelo de datos

```sql
CREATE TABLE conversaciones (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tienda_id          UUID NOT NULL REFERENCES tiendas(id) ON DELETE CASCADE,
  comprador_id       UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  ultimo_mensaje_en  TIMESTAMPTZ NOT NULL DEFAULT now(),
  creada_en          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tienda_id, comprador_id)
);

CREATE TABLE mensajes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversacion_id  UUID NOT NULL REFERENCES conversaciones(id) ON DELETE CASCADE,
  autor_id         UUID NULL REFERENCES usuarios(id) ON DELETE SET NULL,
  de_tienda        BOOLEAN NOT NULL,          -- true = lo escribió alguien del equipo
  texto            TEXT NOT NULL,             -- hasta 1000 caracteres; admite emojis
  plantilla        TEXT NULL,                 -- 'abierta' | 'si_abierta' | 'no_abierta' | 'ajuste'
  pedido_id        UUID NULL REFERENCES pedidos(id) ON DELETE SET NULL,
  leido_en         TIMESTAMPTZ NULL,          -- lo leyó la otra parte
  creado_en        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON mensajes (conversacion_id, creado_en);

ALTER TABLE tiendas ADD COLUMN chat_notif_fuera_horario BOOLEAN NOT NULL DEFAULT false;
```

## Reglas de negocio

### Quién participa
- **Comprador:** cualquier usuario con sesión, con cualquier tienda que no sea propia ni donde es parte del equipo (`409 CHAT_TIENDA_PROPIA`).
- **Tienda:** el propietario y los miembros con permiso `pedidos` leen y responden en nombre de la tienda (`de_tienda = true`).

### Botones "¿está abierta?" (siempre disponibles)
Sirven para confirmar si la tienda abrió y se pueden usar en **cualquier plan**, sin condiciones:

| Plantilla | Quién | Texto |
| --- | --- | --- |
| `abierta` | Comprador | "¡Hola! Buen día. ¿La tienda está abierta?" |
| `si_abierta` | Tienda | "¡Hola! Sí, estamos abiertos. ¡Te esperamos!" |
| `no_abierta` | Tienda | "¡Hola! Por ahora estamos cerrados. ¡Gracias por escribir!" |

La plantilla `ajuste` la usa el sistema para dejar constancia de cada paso de un ajuste de peso (04-pedidos.md); no la manda una persona.

### Texto libre (texto y emojis)
`chatLibre(comprador, tienda)` es verdadero si se cumple **alguna** de estas condiciones:
1. el comprador o la tienda tienen plan **premium o plata**;
2. el comprador tiene una venta **cobrada** en esa tienda hace **60 días o menos**;
3. el comprador tiene en esa tienda un pedido **sin terminar** (`pendiente`, `confirmado` o `listo_para_retirar`). Al terminar el pedido (entregado, rechazado o cancelado) esa condición deja de valer.

Si no se cumple ninguna, el chat se abre igual, pero solo con los botones: un texto libre responde `403 CHAT_SOLO_BOTONES` y la UI muestra el campo deshabilitado con el motivo. Las mismas reglas valen para las respuestas de la tienda.

- **Texto:** de 1 a 1000 caracteres, sin contar los espacios de los bordes (`400 MENSAJE_INVALIDO`).
- **Plantilla:** una que no corresponde a quien la manda responde `400 PLANTILLA_INVALIDA`.

### Notificaciones (tipo `mensaje_chat`, categoría `chat`, urgencia alta)
- **Al comprador:** siempre, según sus preferencias.
- **A la tienda** (propietario y miembros con permiso `pedidos`):
  - en **horario de apertura** (`estadoApertura` = `abierta` o `desconocido`), siempre;
  - fuera de horario, solo si la tienda activó `chat_notif_fuera_horario`, que lo cambia el propietario desde mi-tienda.
- Los mensajes generados por el sistema (`ajuste`) no notifican por el chat: el ajuste ya notifica por su cuenta.

## Endpoints REST
- `GET /api/chat/conversaciones?tiendaId=` — sin `tiendaId`, las del usuario como comprador; con `tiendaId`, las de esa tienda (exige el permiso `pedidos`). Cada una con la otra parte, el último mensaje y los no leídos.
- `POST /api/chat/conversaciones` — body `{ tiendaId }`: abre (o devuelve) la conversación del usuario con esa tienda.
- `GET /api/chat/conversaciones/:id` — conversación, mensajes (los últimos 100), `chatLibre`, `motivo` y las plantillas disponibles para quien mira. Marca como leídos los mensajes de la otra parte.
- `POST /api/chat/conversaciones/:id/mensajes` — body `{ texto }` o `{ plantilla }`.
- `PATCH /api/tiendas/:id` acepta `chatNotifFueraHorario` (solo el propietario).

## Firmas de funciones/clases TypeScript

```ts
// src/lib/chat/chat.ts
export const PLANTILLAS: Record<Plantilla, { de: 'comprador' | 'tienda' | 'sistema'; texto: string }>;
export function chatLibre(compradorId: string, tiendaId: string, ahora?: Date): Promise<{ libre: boolean; motivo: string | null }>;
export function abrirConversacion(usuario: Usuario, tiendaId: string): Promise<Conversacion>;
export function obtenerConversacion(usuario: Usuario, id: string, ahora?: Date): Promise<ConversacionDetalle>;
export function enviarMensaje(usuario: Usuario, conversacionId: string, input: { texto?: string; plantilla?: Plantilla }, ahora?: Date): Promise<Mensaje>;
export function listarConversaciones(usuario: Usuario, tiendaId?: string): Promise<ConversacionResumen[]>;
export function mensajeDeSistema(pedidoId: string, texto: string, deTienda: boolean, autorId: string): Promise<void>; // ajustes de peso
```

## Casos de error

| Código | HTTP | Cuándo |
| --- | --- | --- |
| `CONVERSACION_NO_ENCONTRADA` | 404 | No existe o el usuario no participa. |
| `CHAT_TIENDA_PROPIA` | 409 | El comprador es dueño o parte del equipo de esa tienda. |
| `CHAT_SOLO_BOTONES` | 403 | Texto libre sin cumplir ninguna condición. |
| `MENSAJE_INVALIDO` | 400 | Texto vacío o de más de 1000 caracteres. |
| `PLANTILLA_INVALIDA` | 400 | Plantilla desconocida o que no corresponde a quien la manda. |
