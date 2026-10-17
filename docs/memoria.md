# Memoria del proyecto: pedidos, decisiones y pendientes

## Permia (clon de Almacenia por rubro)

### Pedido del usuario (2026-10-17, dictado, resumido)

> Tomar Almacenia como origen de un clon universal y configurable, "Permia", para
> negocios como una distribuidora de bebidas. Cambiando la categoría del negocio
> cambia toda la UI y el diseño: moderno y joven para bebidas, sobrio y elegante
> para vinos, vibrante y verde para viveros. Es un producto nuevo que se levanta en
> un VPS por cliente, desde una imagen, configurado como Almacenia, y se le vende.

### Rondas de Permia

| Ronda | Alcance | Estado | PR |
| --- | --- | --- | --- |
| P1 | Clon + tema por rubro (`specs/sdd/21-temas.md`): 4 temas, marca y textos por variables, guía de VPS por cliente | Hecha | — |
| P2 | Pendiente de definir (ver preguntas abiertas de Permia) | — | — |

### Decisiones de Permia

- **Un repo propio** (`pablorr37/permia`), clonado con la historia de Almacenia.
- **Rubro por variable de entorno** (`PERMIA_RUBRO`, más `PERMIA_NOMBRE`,
  `PERMIA_ESLOGAN`, `PERMIA_DESCRIPCION`), leída en runtime: una sola imagen Docker
  para todos los clientes. Rubro mal escrito → tema `almacen` + aviso en el log.
- **Temas**: `almacen`, `bebidas`, `vinos`, `vivero`. Cada uno con paleta,
  tipografía, radios, ícono de marca (tienda/botella/copa/planta) y textos. Todos
  cumplen contraste 4,5:1 (lo verifican los tests).
- El naranja de `almacen` se oscureció (`#e2723a` → `#c2561f`) porque con texto
  blanco no llegaba a 4,5:1.
- Las features y el modelo de datos son los de Almacenia, sin cambios.

### Preguntas abiertas de Permia

- **¿Marketplace o tienda única?** Una distribuidora es un solo negocio; Almacenia
  es un marketplace de muchas tiendas con mapa. ¿Cada instalación de Permia muestra
  solo la tienda del cliente (sin mapa de "tiendas cercanas", con sucursales), o
  queda multi-tienda?
- **Datos de demo por rubro**: seed de productos y categorías de bebidas, vinos y
  plantas para mostrarle a cada cliente (hoy el seed es el de almacenes de San Juan).
- **Región**: el radio de alcance y la vitrina están centrados en San Juan.
  ¿Configurable por cliente?
- **Selector de tema en el panel admin**, sin tocar variables.
- **Logo propio** del cliente (hoy: ícono del rubro + nombre).
- **Estilo del vivero desde las webs de referencia** (`viverolaslilas-a` y `-b` de
  Domo): guardado en [`design_vivero.md`](design_vivero.md) (tokens, tipografía,
  componentes y SVG textuales de la A; de la B solo las fuentes, falta su HTML).
  Falta decidir si reemplaza al tema `vivero` actual o se suma como variante, y si
  se trae la mecánica "Arme su lista" (ver §7 del documento).

---

# Almacenia (heredado)

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
| 4 | [Publicidad: Google + otros proveedores + motor propio de Almacenia + pagar publicidad o premium con puntos](rondas/ronda-4-publicidad.md) | Pendiente (tutoriales e investigación listos) | — |
| 5 | [Notificaciones de la app: en la app y push, para vendedores, compradores y generales](rondas/ronda-5-notificaciones.md) | Pendiente | — |
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

## Preguntas abiertas

- **Facturación (resuelto en la ronda 3):**
  - cada tienda elige su condición fiscal;
  - la conexión con ARCA queda para otra ronda, con todo listo.
- **Pendientes de la ronda 3:**
  - conectar con ARCA: WSFEv1, certificado y clave de cada contribuyente, adaptador en `src/lib/facturacion/facturador.ts`;
  - IVA crédito fiscal: necesita un módulo de compras a proveedores;
  - precio de cada plan y cobro (hoy el admin cambia el plan a mano);
  - plan Gold.
- **Publicidad (ronda 4):**
  - IDs de Google AdSense/Ad Manager y qué otros proveedores. Los configura el usuario siguiendo los tutoriales; hace falta un dominio público con política de privacidad.
  - Precio en dinero de la publicidad en el mapa, si además de puntos se va a cobrar.
  - **Pagar con puntos** (valores iniciales propuestos; todos quedan editables en el admin):
    - ¿la publicidad se paga por días de campaña, por impresiones o por ambas cosas?
    - ¿cuánto dura el premium pagado con puntos? Propuesta: 30 días.
    - ¿los puntos gastados bajan el radio de alcance? Hoy el radio se calcula con los puntos totales. Propuesta: el alcance usa los puntos ganados históricos y el saldo para gastar es aparte.
    - ¿un empleado puede pagar publicidad de la tienda con sus propios puntos, o solo el dueño?
- **Notificaciones (ronda 5):**
  - ¿también por email, o solo dentro de la app y push?
  - Límite de publicidad push por usuario y por semana. Propuesta: 2 por semana, editable en el admin.
- **Empleados (ronda 2, resuelta con la lista propuesta):** vender, cobrar, anular, precios, stock, productos, fotos, pedidos, balance, usuarios. Si el usuario quiere otros permisos (por ejemplo, separar "ver" de "editar" el stock), se agregan al enum `permiso_tienda` sin cambiar el modelo.
