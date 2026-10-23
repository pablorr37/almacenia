# Ronda 5: notificaciones de la app

Estado: **hecha** (2026-10-23). Lo implementado y las decisiones finales están en [`../memoria.md`](../memoria.md) ("Rondas 4 y 5") y en las specs `specs/sdd/21-publicidad.md`, `22-notificaciones.md` y `23-puntos-pagos.md`. Este documento queda como borrador histórico. Ver el pedido del 2026-10-17, punto 3, en [`../memoria.md`](../memoria.md).

## Pedido
- **Para vendedores:**
  - pedidos nuevos;
  - pedidos cancelados;
  - pedidos modificados;
  - avisos internos de la app.
- **Para compradores:**
  - ofertas;
  - descuentos;
  - publicidad push.
- **Notificaciones generales**, para todos.

## Canales
1. **Centro de notificaciones dentro de la app**:
   - una campanita con contador en el menú de inicio y en el mapa, y una lista con leídas y no leídas;
   - funciona en cualquier navegador y no pide permisos.
2. **Web Push**: aparece en el celular aunque la app esté cerrada. Next.js trae una guía oficial (`node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md`):
   - `app/manifest.ts`;
   - un service worker en `public/sw.js`;
   - `PushManager.subscribe` con claves **VAPID**;
   - envío desde el servidor con la librería `web-push`.
   - **Android y desktop** (Chrome, Edge, Firefox): funciona desde el navegador.
   - **iPhone (iOS 16.4 o posterior)**: solo si la app está **instalada en la pantalla de inicio** (como PWA). El permiso se pide después de que la persona toca un botón. Hay que mostrar el instructivo "Compartir → Agregar a inicio".
   - Las claves VAPID se generan una sola vez (`web-push generate-vapid-keys`) y van en variables de entorno de Coolify (`NEXT_PUBLIC_VAPID_PUBLIC_KEY` y `VAPID_PRIVATE_KEY`). No deben cambiar entre deploys, porque se invalidan todas las suscripciones.
3. **Email**: opcional, pregunta abierta. Serviría para avisos importantes si la persona no instaló la app.

## Tipos de notificación (catálogo inicial)

| Tipo | Destinatario | Disparador | Push por defecto |
| --- | --- | --- | --- |
| `pedido_nuevo` | Propietario y miembros con permiso `pedidos` | `crearPedido` (`04-pedidos.md`) | Sí |
| `pedido_cancelado` | Tienda (los mismos que arriba) | El comprador cancela | Sí |
| `pedido_modificado` | Tienda / comprador | Cambia el contenido o el estado (confirmado, listo, rechazado) | Sí |
| `pedido_estado` | Comprador | Confirmado, listo para retirar, rechazado o entregado | Sí |
| `aviso_interno` | Usuarios filtrados por rol, plan o tienda | El admin lo escribe en el panel | Configurable |
| `oferta` | Compradores que siguen la tienda o están dentro de su alcance | La tienda carga un precio de oferta (`precioOferta`) | Opt-in |
| `descuento` | Ídem | Promoción o descuento de la tienda | Opt-in |
| `publicidad` | Compradores free; segmento por zona y rubro | Campaña push del motor de avisos (ronda 4) | Opt-in, con tope de frecuencia |
| `general` | Todos | El admin, desde el panel | Configurable |

## Reglas
- **Preferencias por tipo y por canal**, en el perfil:
  - lo transaccional (pedidos) viene activado;
  - ofertas, descuentos y publicidad son **opt-in** (las activa la persona).
- **Tope de frecuencia** para la publicidad push: N por semana por usuario, editable en el admin. Propuesta: 2. No se envía de noche (por ejemplo, entre las 22 y las 8 en hora de San Juan).
- **Premium y plata no reciben publicidad push**, igual que no ven anuncios (ronda 4).
- **Ofertas y descuentos:** solo de tiendas que el comprador sigue o que están dentro de su radio de alcance (`18-alcance.md`). Con agrupación, para no mandar una notificación por producto.
- **Avisos internos y generales:** los escribe el admin, con segmentos (rol, plan, zona, tienda), programación y vista previa.
- **Entrega:** se guarda en la tabla y se intenta el push. Si la suscripción responde 404 o 410 (expirada), se borra.
- **Rendimiento:** el envío masivo (generales, publicidad) va a una cola procesada por lotes, no dentro del request.

## Modelo propuesto (spec futura `specs/sdd/22-notificaciones.md`)

```sql
CREATE TABLE notificaciones (
  id          UUID PRIMARY KEY,
  usuario_id  UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo        TEXT NOT NULL,             -- libre, como eventos_puntos.tipo
  titulo      TEXT NOT NULL,
  cuerpo      TEXT NOT NULL,
  url         TEXT NULL,                 -- a dónde lleva al tocarla
  tienda_id   UUID NULL REFERENCES tiendas(id) ON DELETE CASCADE,
  datos       JSONB NULL,
  leida_en    TIMESTAMPTZ NULL,
  creada_en   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON notificaciones (usuario_id, leida_en, creada_en DESC);

CREATE TABLE suscripciones_push (
  id          UUID PRIMARY KEY,
  usuario_id  UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  endpoint    TEXT NOT NULL UNIQUE,
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  user_agent  TEXT NULL,
  creada_en   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE preferencias_notificacion (
  usuario_id  UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo        TEXT NOT NULL,
  en_app      BOOLEAN NOT NULL,
  push        BOOLEAN NOT NULL,
  PRIMARY KEY (usuario_id, tipo)
);

-- Envíos masivos programados por el admin o por campañas.
CREATE TABLE envios_notificacion (
  id            UUID PRIMARY KEY,
  tipo          TEXT NOT NULL,
  titulo        TEXT NOT NULL,
  cuerpo        TEXT NOT NULL,
  url           TEXT NULL,
  segmento      JSONB NOT NULL,        -- { roles, planes, zona, rubros, tiendaId }
  programado_en TIMESTAMPTZ NULL,
  estado        TEXT NOT NULL,         -- borrador | programado | enviando | enviado | cancelado
  creado_por    UUID NOT NULL REFERENCES usuarios(id),
  enviados      INTEGER NOT NULL DEFAULT 0
);
```

## API propuesta
- `GET /api/notificaciones`: paginado.
- `GET /api/notificaciones/no-leidas`: el contador.
- `POST /api/notificaciones/:id/leida` y `POST /api/notificaciones/leer-todas`.
- `POST /api/push/suscripcion` y `DELETE /api/push/suscripcion`.
- `GET /api/notificaciones/preferencias` y `PUT /api/notificaciones/preferencias`.
- Admin:
  - `POST /api/admin/envios` (crear, con vista previa y conteo del segmento);
  - `POST /api/admin/envios/:id/enviar`;
  - `GET /api/admin/envios`.

## Orden propuesto
1. Centro de notificaciones y eventos de pedidos (no depende de nada externo).
2. PWA: manifest, service worker y suscripción push, con el instructivo para iOS.
3. Preferencias por tipo.
4. Avisos internos y generales desde el admin (envío por lotes).
5. Ofertas y descuentos.
6. Publicidad push, junto con el motor de avisos de la ronda 4.

## Fuentes
- Guía oficial de Next.js para PWA y Web Push: `node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md`.
- [Limitaciones de PWA en iOS (MagicBell)](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide).
- [Web Push en Safari de iOS (Insider)](https://academy.insiderone.com/docs/web-push-support-for-mobile-safari.md).
- [Push autohospedado y VAPID (DEV)](https://dev.to/bunty9/-self-hosted-push-notifications-part-8-f0g).
