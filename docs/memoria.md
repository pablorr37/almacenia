# Memoria del proyecto: pedidos, decisiones y pendientes

Lista viva. **Antes de empezar una tarea, leé este archivo. Al terminarla, actualizalo**:
estado de la ronda, PR y decisiones nuevas. El detalle de cada ronda está en
[`docs/rondas/`](rondas/).

Última actualización: 2026-10-17 (pedido de puntos como pago, publicidad y notificaciones).

## Estado de las rondas

| Ronda | Alcance | Estado | PR |
| --- | --- | --- | --- |
| 1 | Bugs (escáner, editar/eliminar productos, × descentrada) + radio de alcance en el mapa | Hecha | [#8](https://github.com/pablorr37/almacenia/pull/8) |
| 2 | [Inicio del vendedor y menú de inicio, varias tiendas, empleados y permisos](rondas/ronda-2-inicio-vendedor.md) | Hecha | [#9](https://github.com/pablorr37/almacenia/pull/9) |
| 3 | [Precio = costo + ganancia + impuestos, datos para facturar, balance por plan, plan Plata](rondas/ronda-3-precios-balance.md) | Hecha | [#10](https://github.com/pablorr37/almacenia/pull/10) |
| 4 | [Publicidad: motor propio de Almacenia + pagar publicidad o premium con puntos o pesos + transferencias de puntos](rondas/ronda-4-publicidad.md) | Hecha (Google y otros proveedores en espera) | ver "Rondas 4 y 5" |
| 5 | [Notificaciones de la app: en la app, push y email, para vendedores, compradores y generales](rondas/ronda-5-notificaciones.md) | Hecha | ver "Rondas 4 y 5" |
| — | Plan Gold ("casi admin") | Para otra ronda | — |

Forma de trabajo acordada:
- se trabaja en la rama de la sesión;
- se abre un PR y lo mergea Claude apenas termina, sin esperar confirmación;
- Coolify despliega `master` solo.

## Pedido del usuario (2026-10-16, textual)

> 1) El precio de un producto está compuesto por costo+ganancia y lo que la teoría de contabilidad (hay que dejar almacenia lista para poder facturar si es necesario) diga que es el precio de un producto. Eso para poder hacer un balance básico para planes free, sólido para planes premium y completo para planes plata. Gold es casi admin, lo dejamos para otra ronda.
>
> 2) Publicidad dentro de la app: planes premium/plata tienen publicidad al estilo google dentro de la app, con salidas rotativas mixeadas con las de google y otros proveedores, incluso internos de almacenia. Para eso hay que configurar la publicidad de google y de otros proveedores, y dejar lista la infra para un servicio propio de almacenia, con motor de anunciantes y layout de diseño integrado.
>
> 3) Radio de alcance visible: en el mapa (que cambiará de ui, punto 7) se ve el radio de alcance: 3 km para usuarios free con menos de 100 puntos; de 3 a 7 para usuarios free >=100 puntos hasta 500 a 500 dividido en el rango 3 a 7, con curvatura negativa de crecimiento, esto es: el radio se agranda cada vez menos cuantos más puntos se tenga. De 7 a 10 igual: pero x2: de 500 a 1500 puntos. El radio crece muy rápido entre 500 y 700 pero se pone lento a >700. Lo mismo de 10 a 15km: pero esta vez es constante. Hasta 1km cada 100 puntos. Plan Premium tiene este rango: 15km. Plan Plata tiene todo San Juan.
>
> 4) No funciona el escáner qr/barra.
>
> 5) No se puede eliminar o modificar un producto agregado. Hay que arreglar esto.
>
> 6) El ícono de x (quitar) en un pedido/venta no está centrado en el recuadro.
>
> 7) El mapa es la pantalla de inicio de las personas logueadas; la lista de negocios cercanos es para los no logueados; pero eso del lado de compradores. Los vendedores deben tener su tienda como página de inicio. De hecho crear la página de inicio: Nueva venta, manejo de stock (donde se agregan o eliminan o modifican productos y stock), control de usuarios (donde se promueve o quita usuarios de la app como empleados, encargados, el user propietario que le da permisos a los users empleados como cambiar precios, cobrar una venta, cambiar o no foto, etc. permisos que el dueño tiene y que el dueño puede dar o revocar a otros users de la app para que vendan en su/s tienda/s), balance, …

## Pedido del usuario (2026-10-17, textual)

> guarda en memoria la siguiente feat:
> 1) los vendedores pueden pagar publicidad con puntos. Los compradores pueden pagar plan premium con puntos. Cantidad de puntos para pagar ambas cosas calibrable en panel admin.
> 2) Haz un tutorial para google adsense ad manager y otro proveedores, y haz investigación para crear nuestro propio motor de avisos (cargar img/gif animado; alta, baja, pausa, rotación, publicidad push)
> 3) Notificaciones de la app: para vendedores, nuevos pedidos/pedidos cancelados, modificación de pedidos, avisos internos de la app; para compradores: notificaciones de ofertas, descuentos, push de publicidad. Notificaciones generales.

Dónde quedó cada punto:
- **Punto 1, pagar con puntos:** entra en la ronda 4. Ver "Pagar con puntos" en [`rondas/ronda-4-publicidad.md`](rondas/ronda-4-publicidad.md).
- **Punto 2, tutoriales:** [`tutoriales/publicidad-google-adsense.md`](tutoriales/publicidad-google-adsense.md), [`tutoriales/publicidad-google-ad-manager.md`](tutoriales/publicidad-google-ad-manager.md) y [`tutoriales/publicidad-otros-proveedores.md`](tutoriales/publicidad-otros-proveedores.md).
- **Punto 2, investigación del motor propio:** [`investigacion/motor-de-avisos.md`](investigacion/motor-de-avisos.md).
- **Punto 3, notificaciones:** ronda 5, en [`rondas/ronda-5-notificaciones.md`](rondas/ronda-5-notificaciones.md). La "publicidad push" del punto 2 sale por el canal de notificaciones de esa ronda.

Aclaraciones posteriores del usuario (pedido del 2026-10-16):
- **Punto 7, lo que seguía a "balance":** la pantalla de inicio es un **menú** que enlaza a cada función o grupo de funciones de la app. El mapa es una de ellas.
- **Punto 4:** la cámara abre bien, pero **no lee** el código de barras ni el QR, **no puede enfocar** y **no tiene botón para salir o volver**.

## Decisiones tomadas

- **Publicidad:**
  - Compradores y vendedores con plan **free** ven anuncios rotativos (Google + otros proveedores + anuncios propios de Almacenia).
  - En el mapa, ven el **nombre de las tiendas que pagan publicidad** junto a su pin.
  - Los usuarios **premium y plata** no ven anuncios; en el mapa ven solo el nombre en el pin.
  - Esto contradice "planes premium/plata tienen publicidad" del texto original; lo aclaró el usuario.
- **Plan por usuario:** free / premium / plata, tanto para compradores como para vendedores. Gold queda para otra ronda.
  - Hoy el plan vive en la tienda (`tiendas.plan`).
  - La ronda 1 agrega `usuarios.plan`.
  - La ronda 3 unifica: el plan de la tienda pasa a ser el de su dueño.
- **Varias tiendas por dueño** (sucursales), con empleados/encargados por tienda y permisos que el dueño da y quita (ronda 2).
- **Radio de alcance** (ronda 1, `specs/sdd/18-alcance.md`):

  | Plan | Puntos | Radio |
  | --- | --- | --- |
  | free | menos de 100 | 3 km |
  | free | 100–500 | 3 → 7 km, cóncava: `3 + 4·(1 − (1 − x)²)` |
  | free | 500–1500 | 7 → 10 km, muy cóncava: `7 + 3·(1 − (1 − x)⁴)`; muy rápido entre 500 y 700 |
  | free | 1500–2000 | 10 → 15 km, lineal: 1 km cada 100 puntos |
  | free | 2000 o más | 15 km |
  | premium | — | 15 km |
  | plata | — | toda la provincia de San Juan |

  En las fórmulas, `x` es la posición dentro del tramo, de 0 a 1.

## Ronda 1: qué quedó hecho

- **Escáner:**
  - lee con el `BarcodeDetector` nativo o, si no hay, con zxing limitado a EAN/UPC/Code 128/QR;
  - enfoque continuo, tocar para enfocar y linterna;
  - pantalla completa con botón Cerrar, Escape y gesto atrás.
  - Probado en Chromium con cámara falsa: EAN-13 leído en ~0,2 s y QR leído.
  - **Pendiente:** el usuario prueba el enfoque en un celular real.
- **Productos:** Editar (precio, oferta, stock, disponible, descripción) y Eliminar desde mi-tienda → Productos.
  - Eliminar es una baja real (`productos.eliminado_en`): desaparece de la tienda, el punto de venta, el itinerario y el admin.
  - Las ventas y pedidos viejos lo conservan.
- **×:** las × de quitar/cerrar son un SVG centrado (`src/components/ui/IconoX.tsx`).
- **Radio de alcance** (`specs/sdd/18-alcance.md`):
  - `usuarios.plan`;
  - `GET /api/alcance`;
  - `/api/tiendas/cercanas` limitado al alcance con sesión;
  - círculo y chip en el mapa;
  - selector de plan en `/admin/usuarios`.
  - Los invitados no se limitan: su lista es una vitrina de hasta 50 km desde el centro de San Juan.
- **Plan por usuario vs. por tienda:** el enum `plan` ya tiene `plata`. Desde el admin, la tienda sigue siendo free/premium hasta la ronda 3.

## Ronda 2: qué quedó hecho

Spec: `specs/sdd/19-equipo-tienda.md`.

- **Pantalla de inicio:**
  - sin sesión, la lista de negocios cercanos (`HomeInvitado`);
  - con sesión, un **menú** con "Mi negocio" (si gestiona alguna tienda), "Comprar" (Mapa, Listas, Mis pedidos, Mis puntos) y la cuenta.
  - El mapa pasó a `/mapa`.
- **Mi negocio:**
  - selector de tienda activa (se recuerda en el navegador);
  - accesos según permisos: Nueva venta, Stock, Pedidos, Usuarios, Balance, Datos de la tienda;
  - Nueva sucursal.
- **Varias tiendas por usuario:** se quitó el UNIQUE de `tiendas.vendedor_id`; `GET /api/tiendas/mias`.
- **Equipo** (`miembros_tienda`):
  - el propietario (o alguien con permiso `usuarios`) suma usuarios por email o con el QR de "Compartir mis datos", como encargado o empleado;
  - los permisos se marcan uno por uno;
  - por defecto: encargado tiene todos menos `usuarios`; empleado tiene vender y cobrar.
  - Todos los chequeos de "dueño" pasan por `exigirPermiso`.
- **Balance básico** (`/mi-tienda/balance`):
  - cobrado, por cobrar y anuladas;
  - por día, por medio de pago y por quién vendió (`ventas.vendida_por_id`).
  - La ronda 3 le suma costo, ganancia e impuestos.
- **Decisiones de esta ronda:**
  - ~~los puntos por venta siguen yendo al propietario aunque venda un empleado~~ → **corregido por el usuario (ronda 3):** se reparten entre quien vendió y el dueño; la proporción la configura el dueño en su tienda (por defecto 50/50, valor del sistema editable por el admin, nada fijo en el código);
  - valorar clientes y editar los datos de la tienda son solo del propietario;
  - cobrar en el momento pide el permiso `cobrar`.

## Ronda 3: qué quedó hecho

Spec: `specs/sdd/20-precios-facturacion.md`.

- **Reparto de puntos por venta** (pedido del usuario):
  - cuando vende alguien del equipo, los puntos se reparten entre esa persona y el dueño;
  - el % lo configura el dueño en mi-tienda → Tienda;
  - si no lo configura, rige el default del sistema (50 %, editable por el admin en la configuración). Nada fijo en el código.
- **Precio = costo + ganancia + impuestos:**
  - en el alta y la edición de un producto, costo, ganancia % y precio final están enlazados;
  - se eligen la alícuota de IVA (en tiendas responsables inscriptas) y los impuestos internos;
  - el desglose se ve en vivo y hay aviso si el margen es negativo.
  - Responsable inscripto: neto + IVA + internos. Monotributo/exento: el IVA no se discrimina.
  - El costo y el margen no se muestran al público.
- **Foto fiscal en cada venta:** costo, alícuota, neto, IVA e internos del momento, para que el balance histórico no cambie.
- **Datos fiscales de la tienda:**
  - condición frente al IVA, razón social, CUIT (con dígito verificador), IIBB, domicilio fiscal, punto de venta e inicio de actividades;
  - los edita solo el dueño.
- **Comprobantes:**
  - botón "Comprobante" en las ventas cobradas;
  - tipo A, B o C según emisor y cliente, con numeración correlativa por tienda, punto de venta y tipo;
  - vista imprimible con la leyenda "Comprobante interno — no válido como factura" mientras no haya CAE.
  - La interfaz `Facturador` queda lista (adaptador `SinFacturacion`).
- **Plan de la tienda = plan del dueño**, con tope de tiendas por plan:

  | Plan | Tiendas |
  | --- | --- |
  | free | 1 |
  | premium | 3 (2 sucursales) |
  | plata | 4 (3 sucursales) |

  - El admin cambia el plan en el usuario; se quitó el plan por tienda.
  - El menú muestra cuántas tiendas usa el dueño y lo invita a mejorar el plan.
- **Balance por plan:**

  | Plan | Nivel | Qué muestra |
  | --- | --- | --- |
  | free | básico | ventas, cobrado/por cobrar y más vendidos |
  | premium | sólido | + costo vendido, ganancia y margen, rentabilidad por producto y categoría, valor del stock, comparativo |
  | plata | completo | + IVA débito por alícuota, flujo de caja, alertas (stock bajo configurable por el admin, margen negativo, sin costo), libro de ventas CSV, rentabilidad de todas las sucursales |

  Las secciones de un plan mayor se ven bloqueadas.

## Cambios del 2026-10-23 (pedido del usuario)

> Haremos un cambio: usuarios > premium pueden agregar categorías de productos. Si la categoría que escriben no está, al momento de guardar el producto esa categoría nueva también se agrega. Ya no es solo el admin el que agrega categorías. Y en eventa, agrega que se puede usar el escaner de qr/codigo de barras para escanear el producto y agregarlo a la lista del pedido. Hoy no está

- **Categorías creadas por usuarios** (`17-rubros-categorias.md`):
  - "usuarios > premium" se interpretó como **premium o mayor** (premium y plata);
  - al cargar un producto, si la categoría no existe, el buscador ofrece "+ Crear categoría «…»" y se crea **al guardar el producto**;
  - si el alta falla, la categoría no queda creada;
  - si ya existía con otra tilde o con mayúsculas, se usa la existente;
  - se guarda quién la creó (`categorias_producto.creada_por_id`); el admin la puede renombrar o borrar;
  - en una tienda vale el plan de la tienda (el del dueño) o el del usuario: un empleado de una tienda premium puede crearlas;
  - desde una lista de compras vale el plan del usuario;
  - los usuarios free ven "Con Premium podés crearla".
- **Escanear producto en el punto de venta** (`05-ventas.md`):
  - un botón con el ícono de código de barras, al lado del buscador, abre el escáner;
  - el código leído (de barras o un QR que lo contenga) se busca en los productos de la tienda y suma una unidad (o el paso de kg) al ticket;
  - UPC-A y EAN-13 se toman como el mismo código;
  - avisa si no hay más stock;
  - si el producto no está cargado, ofrece "Darlo de alta".

## Decisiones de la ronda 4 (2026-10-23, respuestas del usuario)

| # | Tema | Decisión |
| --- | --- | --- |
| 1 | Cobro de la publicidad | Por **día de campaña**, en puntos y en pesos (push: por envío). |
| 2 | Premium con puntos | 30 días, con **renovación automática opcional** con puntos o en pesos. |
| 3 | ¿Canjear achica el radio? | **No**: el radio usa los puntos **ganados**; el saldo para gastar es aparte. |
| 4 | Puntos en el equipo | Cualquier persona de una misma tienda (dueño, encargados, empleados) puede **transferir** puntos a otra de esa tienda, con topes del admin. Las transferencias recibidas no agrandan el radio. |
| 5 | Precios en puntos | Los propuestos (1500 premium, 100/día aviso, 50/día pin, 300 push), editables en el admin. |
| 6 | Pesos | Precios en pesos editables; cobro manual confirmado por el admin, con la infraestructura lista para sumar Mercado Pago. |
| 7 | Google y otros proveedores | **En espera**. |
| 8 | Email | Las notificaciones también salen **por email**. |
| 9 | Publicidad push | Tope de **2 por semana** por usuario, **sin envíos de noche** (8 a 22 h, editables). |

Además: "que estos cambios sean compatibles con el push de recién" (PR de categorías y escaneo): se verificó que su e2e sigue pasando igual.

## Rondas 4 y 5: qué quedó hecho

Specs nuevas: `21-publicidad.md`, `22-notificaciones.md`, `23-puntos-pagos.md` (y ajustes en 04, 10, 11, 12, 18, 19).

- **Puntos como medio de pago:**
  - saldo (para gastar) y ganados (para el radio); "Mis puntos" muestra los dos;
  - canje de premium por puntos, atómico (dos canjes simultáneos no gastan dos veces);
  - plan con vencimiento (`plan_vence_en`) y renovación automática por puntos o pesos, con 3 días de gracia para pagar (editable); aviso 3 días antes; el plan asignado a mano por el admin no vence;
  - transferencias entre personas del equipo de una tienda, con topes por vez (500) y por mes (2000).
- **Pagos en pesos:** órdenes de pago con código; el admin las confirma en **Admin → Pagos** y se activa el premium o la campaña. Interfaz `ProcesadorPagos` con el adaptador `PagoManual`; Mercado Pago entra como otro adaptador.
- **Motor de avisos propio:**
  - espacios: inicio, lista de negocios, buscar y comparar, pie de tienda, tienda destacada en el mapa y push;
  - piezas con imagen (JPEG, PNG, WebP o GIF animado, convertidas a WebP) o texto; destino opcional;
  - permiso nuevo de equipo `publicidad`; paga con sus puntos o en pesos quien crea la campaña;
  - moderación en **Admin → Publicidad** (rechazar devuelve los puntos);
  - pausar (no consume días), reanudar, finalizar (devuelve los días no usados × `canje.reintegro_pct`);
  - rotador ponderado, solo free e invitados, tope de 3 impresiones por campaña, usuario y día, sin mostrarle al equipo sus propios avisos, segmento por radio;
  - impresión visible (50 % durante 1 s) y clic con token firmado; los bots no cuentan; métricas en mi-tienda;
  - **tienda destacada**: free ve el nombre junto al pin con "Destacado"; premium y plata, solo el nombre;
  - premium y plata no ven avisos (ni se reserva el espacio); sin campañas se ve "¿Tenés un comercio? Publicitalo acá";
  - nunca en mi-tienda ni junto a botones de acción (en la página de la tienda no aparece mientras hay un pedido armado).
- **Listo para AdSense (en espera):** `/privacidad`, `/terminos`, `robots.txt`, `/ads.txt` desde `ADS_TXT`, aviso de cookies. Los textos legales son un borrador: conviene que los revise un profesional.
- **Notificaciones:**
  - campanita con contador en el inicio y el mapa; `/notificaciones`;
  - preferencias por categoría (pedidos, mi cuenta, avisos, ofertas, publicidad) y canal (app, push, email) en el perfil; ofertas y publicidad son opt-in;
  - pedidos: nuevo y cancelado al equipo con permiso `pedidos`; cambios de estado al comprador y al resto del equipo;
  - ofertas: al cargar un precio de oferta, a compradores que ya compraron, hicieron check-in o visitaron la tienda (una por tienda por día);
  - avisos internos y generales del admin por segmento (rol, plan, tienda), con conteo previo y envío por lotes (**Admin → Notificaciones**);
  - PWA instalable (manifest, íconos, service worker) y push con VAPID; instructivo para iPhone; email por SMTP;
  - sin claves VAPID o SMTP, esos canales quedan apagados sin romper nada.
- **Tareas programadas:** `POST /api/cron/tareas` cada hora (ver `docs/deploy-coolify.md` 4.5).
- **Verificación:** 852 tests en verde, build OK, lint sin errores nuevos. E2E con Chromium: canje y renovación, transferencia, campañas con puntos y pesos, moderación, aviso e impresión/clic, pin destacado (free y premium), campanita por pedido nuevo, email por SMTP de prueba, envío push (VAPID + cifrado) a un servicio push de prueba, cron, ads.txt, cookies y páginas legales; y el e2e de categorías y escaneo (PR anterior) sigue pasando.

## Preguntas abiertas

- **Facturación (resuelto en la ronda 3):**
  - cada tienda elige su condición fiscal;
  - la conexión con ARCA queda para otra ronda, con todo listo.
- **Pendientes de la ronda 3:**
  - conectar con ARCA: WSFEv1, certificado y clave de cada contribuyente, adaptador en `src/lib/facturacion/facturador.ts`;
  - IVA crédito fiscal: necesita un módulo de compras a proveedores;
  - precio de cada plan y cobro (hoy el admin cambia el plan a mano);
  - plan Gold.
- **Pendientes de las rondas 4 y 5:**
  - Google AdSense/Ad Manager y otros proveedores (en espera): IDs según los tutoriales de `docs/tutoriales/`;
  - adaptador de Mercado Pago (hoy el pago en pesos es manual);
  - en Coolify: programar `POST /api/cron/tareas` cada hora y cargar `CRON_TOKEN`, las claves VAPID, el SMTP y `APP_URL` (paso a paso en [`tutoriales/variables-entorno-ronda-4-5.md`](tutoriales/variables-entorno-ronda-4-5.md));
  - revisar los textos de `/privacidad` y `/terminos` con un profesional;
  - segmentar la publicidad push y las ofertas por zona necesitaría guardar la zona del comprador (hoy: publicidad push a todos los free con opt-in; ofertas a quien ya interactuó con la tienda);
  - "pedido modificado": hoy no se puede editar el contenido de un pedido; se notifica cuando alguien del equipo cambia su estado.
- **Empleados (ronda 2, resuelta con la lista propuesta):** vender, cobrar, anular, precios, stock, productos, fotos, pedidos, balance, usuarios. Si el usuario quiere otros permisos (por ejemplo, separar "ver" de "editar" el stock), se agregan al enum `permiso_tienda` sin cambiar el modelo.
