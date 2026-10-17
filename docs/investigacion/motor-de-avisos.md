# Investigación: motor de avisos propio de Almacenia

Pedido del usuario (2026-10-17, punto 2): crear un motor de avisos propio que permita:
- cargar imágenes y GIF animados;
- dar de alta, de baja y pausar avisos;
- rotarlos;
- enviar publicidad push.

Se suma a lo ya decidido para la ronda 4 ([`../rondas/ronda-4-publicidad.md`](../rondas/ronda-4-publicidad.md)):
- los anuncios los ven solo los usuarios **free**;
- en el mapa aparece **el nombre de la tienda que paga** junto a su pin;
- los vendedores pueden **pagar la publicidad con puntos**.

## 1. ¿Usar un ad server existente o hacer uno propio?

| Opción | Pros | Contras |
| --- | --- | --- |
| **Revive Adserver** (open source, GPL-2.0, heredero de OpenX) | Maduro: campañas, zonas, banners, topes de frecuencia, reportes. Se puede autohospedar en Coolify. | Es otra aplicación en **PHP + MySQL**, con otra base de datos y otro login. No conoce a nuestros usuarios, planes, puntos, tiendas, rubros ni el radio de alcance; habría que sincronizarlo todo. Su interfaz es de otra época y la del anunciante no se integra con mi-tienda. |
| **SaaS** (AdButler, Kevel, Epom, etc.) | Rápido de usar, con buena medición. | Costo mensual en USD, dependencia externa y el mismo problema de integración. |
| **Google Ad Manager** | Gratis hasta un volumen alto; sirve para campañas directas más relleno con AdSense. | La carga de avisos la hace el admin en la consola de Google, no el comercio desde la app. No permite cobrar en puntos ni segmentar por nuestro radio de alcance. |
| **Motor propio dentro de Almacenia** (Next.js + Prisma + MinIO) | Usa todo lo que ya existe: usuarios, plan, puntos, tiendas, rubros, ubicación, equipo con permisos, almacenamiento S3 y admin. El comercio publicita desde mi-tienda y paga con dinero o puntos. Diseño integrado y sin terceros. | Hay que construir y mantener la rotación, la medición y el antifraude. A esta escala es poco código (ver abajo). |

**Recomendación: motor propio, liviano y bien acotado.**
- Lo diferencial del pedido (pago con puntos, segmentación por alcance y rubro, pin en el mapa, push) **no lo resuelve ningún ad server genérico** sin integración pesada.
- Para la demanda programática (Google y otros) se usan sus scripts como proveedores del rotador.
- Si algún día hace falta una consola de campañas más grande, se suma Ad Manager por encima.

## 2. Conceptos y modelo de datos (propuesta para la spec `21-publicidad.md`)

```
Anunciante (una tienda de Almacenia o una empresa externa que carga el admin)
 └─< Campaña  (objetivo, fechas, estado, presupuesto en $ o en puntos, segmentación, tope de frecuencia)
       └─< Pieza  (creativo: imagen, GIF o texto; formato = espacio; link de destino; estado de moderación)
Espacio (slot): inicio | lista | comparar | tienda_pie | pin_mapa | push
Evento: impresión visible | clic | conversión (por ejemplo, entra a la tienda o hace un pedido)
```

- **`campanias`**:
  - datos generales: `id`, `anunciante_tienda_id` (nullable), `anunciante_externo` (nullable), `nombre`;
  - `estado`: `borrador | en_revision | activa | pausada | finalizada | rechazada`;
  - `desde` / `hasta`;
  - presupuesto: `presupuesto_tipo` (`dinero | puntos | cortesia`), `presupuesto_total`, `consumido`;
  - `modelo_cobro`: `por_dia | cpm | cpc` (al principio, **por día**, que es más simple y se puede pagar con puntos);
  - `segmento` (jsonb):
    - `zona`: centro y radio, o "toda la provincia";
    - `rubros[]`;
    - `planes[]`: siempre `free` para los anuncios;
    - `dias_semana[]`, `franja_horaria`;
  - `tope_frecuencia` (por ejemplo, 3 por usuario por día);
  - `peso` (prioridad en la rotación);
  - `creada_por`.
- **`piezas`**:
  - `campania_id`, `espacio`;
  - `tipo` (`imagen | gif | texto`);
  - `url_archivo`, `ancho`, `alto`, `bytes`;
  - `titulo`, `texto`, `url_destino`;
  - moderación: `estado_moderacion` (`pendiente | aprobada | rechazada`) y `motivo_rechazo`.
- **`eventos_aviso`**:
  - `pieza_id`, `campania_id`, `usuario_id` (nullable para invitados), `tipo` (`impresion | clic`), `espacio`, `creado_en`;
  - índices por `campania_id` y fecha;
  - **agregado diario** en `metricas_aviso_diarias` para no crecer sin control (las filas crudas se borran a los 90 días).
- **Pin destacado en el mapa:** es una campaña con espacio `pin_mapa`. No necesita pieza: muestra el nombre de la tienda.

## 3. Carga de imágenes y GIF animados
- **Ya existe la infraestructura**: `src/lib/archivos/archivos.ts` sube a MinIO/S3 con validación de tipo y tamaño (hoy JPEG, PNG y WebP, hasta 5 MB). Hay que sumar:
  - el tipo `image/gif`, con un límite propio (por ejemplo, **1 MB** para piezas animadas) y un nuevo `TipoArchivo = "aviso"`;
  - la validación de **dimensiones por espacio**:

    | Espacio | Tamaños aceptados |
    | --- | --- |
    | Inicio, lista y pie de tienda | 640x200 (2x de 320x100) o 640x100 (2x de 320x50) |
    | Comparar | 600x500 (2x de 300x250) |

  - Se valida el ancho y el alto reales leyendo la cabecera del archivo, no lo que declara el navegador.
- **Optimización recomendada:** convertir el GIF a **WebP animado** (y opcionalmente a MP4 corto sin sonido). Pesa entre 3 y 10 veces menos y se ve igual.
  - En Node, la librería estándar es [`sharp`](https://sharp.pixelplumbing.com/), que lee GIF animados y escribe WebP animado (`sharp(buf, { animated: true }).webp()`). Se guardan las dos versiones y se sirve WebP con GIF de respaldo.
- **Reglas de contenido** (para la moderación y el texto de ayuda):
  - sin parpadeos de más de 3 por segundo (accesibilidad y fotosensibilidad);
  - animación de 15 segundos como máximo, o que se detenga;
  - sin imitar botones del sistema;
  - texto legible.
- **Moderación:**
  - toda pieza nueva queda **pendiente** hasta que la aprueba el admin, o un tester con permiso, en una cola parecida a la del banco de fotos (`16-banco-fotos.md`);
  - el texto pasa por `exigirTextoPermitido`, la moderación que ya existe.

## 4. Alta, baja, pausa
- **Comercio (desde mi-tienda → "Publicidad", con el permiso del dueño):**
  - crear la campaña: elegir espacio, subir la pieza, días, zona y rubros;
  - **ver el costo en puntos o en $** y confirmar: el canje es atómico (ver la ronda 4);
  - **pausar o reanudar**; los días pausados no se cobran si el cobro es por día;
  - **finalizar**: la baja; los puntos de los días no usados se devuelven según una regla configurable.
- **Admin:**
  - aprueba o rechaza piezas;
  - carga anunciantes externos;
  - crea campañas de cortesía o internas de Almacenia (por ejemplo, "Pasate a Premium");
  - pausa todo en caso de emergencia;
  - ve las métricas.
- **Transiciones de estado** validadas en un solo lugar, como la máquina de estados de pedidos (`04-pedidos.md`). Un job diario finaliza las campañas vencidas o sin presupuesto.

## 5. Rotación (qué aviso se muestra en cada espacio)
Algoritmo propuesto, en el servidor, con `GET /api/avisos?espacio=lista&lat=&lon=`:
1. **Elegibles:**
   - campañas `activa`, dentro de fechas y horario, con presupuesto y con pieza aprobada para ese espacio;
   - cuyo segmento incluye al usuario: plan free, rubro, y zona según la distancia a su ubicación o a la tienda que está mirando;
   - que no superan el **tope de frecuencia** del usuario hoy (conteo en `eventos_aviso`, o en un contador en memoria con TTL si crece).
2. **Mezcla con proveedores:** según los **pesos del espacio** que configura el admin, se decide primero si el turno es para un aviso **propio** o para un **proveedor** (Google u otro). Si toca propio y no hay elegibles, cae al proveedor, y al revés.
3. **Entre los propios elegibles:** **sorteo ponderado** por `peso`.
   - **Pacing** (ritmo de entrega): se baja el peso de una campaña adelantada respecto de lo esperado para el día, así el presupuesto dura todo el período.
   - **Rotación justa** entre piezas de una misma campaña.
4. **Respuesta:** `{ fuente: 'propio' | 'adsense' | ..., pieza?, token }`. El `token` firmado sirve para registrar la impresión y el clic sin que se puedan inventar.
5. **Sin caché** (00-overview.md), con un tiempo de respuesta mínimo. En el cliente, el componente `<EspacioPublicitario espacio="lista">` reserva el alto y renderiza la pieza o el script del proveedor.

## 6. Medición confiable
- **Impresión visible:** se cuenta solo cuando la pieza estuvo **al menos 50 % en pantalla durante 1 segundo** (criterio estándar de visibilidad de la industria, IAB/MRC). Se mide con `IntersectionObserver` y se envía con `navigator.sendBeacon('/api/avisos/impresion', token)`.
- **Clic:** el link pasa por `/api/avisos/clic?token=…`, que registra el clic y redirige con un 302 a `url_destino`, validando que sea un destino permitido. Así no hay redirecciones abiertas.
- **Antifraude básico:**
  - deduplicar por usuario, pieza y minuto;
  - ignorar los bots por user-agent;
  - **el dueño de la tienda y su equipo no cuentan** para sus propios avisos;
  - limitar la cantidad de eventos por IP.
- **Métricas para el comercio y el admin:**
  - impresiones, clics y CTR;
  - "visitas a la tienda" y "pedidos" atribuidos dentro de las 24 h siguientes a un clic;
  - consumo de presupuesto.

## 7. Publicidad push
- Usa el **canal de notificaciones de la ronda 5** ([`../rondas/ronda-5-notificaciones.md`](../rondas/ronda-5-notificaciones.md)): Web Push con VAPID y centro de notificaciones.
- **Reglas:**
  - solo compradores **free** que **activaron** "ofertas y publicidad" (opt-in);
  - **tope por usuario** (por ejemplo, 2 por semana, en la configuración del admin);
  - sin envíos de noche;
  - segmentación por zona y rubro como cualquier campaña.
- **Formato:** título (40 caracteres), texto (120 caracteres), imagen opcional y link a la tienda o al producto. Moderación previa obligatoria.
- **Cobro:** por envío o por bloque de destinatarios. Se puede pagar con puntos (`canje.publicidad_push_puntos`).
- **Envío por lotes** con una cola. Se registran "enviado", "abierto" (clic en la notificación) y "convertido".

## 8. Seguridad y cumplimiento
- Política de privacidad y aviso de cookies: el motor propio no necesita cookies de terceros, solo el usuario logueado.
- No se muestran avisos a premium ni a plata. Tampoco a menores de edad, si en algún momento se registran.
- Los avisos de Almacenia llevan siempre la etiqueta **"Publicidad"** o **"Patrocinado"**, también el pin del mapa ("Destacado").
- Puntos y anuncios de terceros: **jamás** premiar clics en anuncios de Google u otras redes (está prohibido por sus políticas). Los puntos solo pagan publicidad **propia**.

## 9. Estimación y orden de construcción
1. **Modelo y admin** (campañas, piezas, moderación) y carga de imágenes y GIF a MinIO (con `sharp` para WebP).
2. **Rotador y espacios** en la UI, con impresión visible y clic con redirección.
3. **Comercio:** "Publicidad" en mi-tienda, con pago en puntos (canje atómico) y métricas.
4. **Pin destacado en el mapa.**
5. **Proveedores externos** en el rotador (AdSense y otros).
6. **Publicidad push** (cuando esté la ronda 5).

Cada paso va con su spec y sus tests (TDD), como el resto del proyecto.

## Fuentes
- [Revive Adserver (ficha de La Fabrique du Net)](https://www.lafabriquedunet.fr/logiciel/revive-adserver).
- [Alternativas autohospedadas a AdButler (selfhostyourself)](https://selfhostyourself.com/alternative-to/adbutler).
- [Alternativas a Revive en AlternativeTo](https://alternativeto.net/software/reviveadservermod).
- [Ejemplo oficial de GPT con React (Google)](https://developers.google.com/publisher-tag/samples/integrations/react?hl=es).
- Guía oficial de PWA y Web Push de Next.js: `node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md`.
- [Documentación de `sharp`: imágenes animadas](https://sharp.pixelplumbing.com/api-constructor).
