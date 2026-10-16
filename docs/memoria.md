# Memoria del proyecto: pedidos, decisiones y pendientes

Lista viva. **Antes de empezar una tarea, leé este archivo. Al terminarla, actualizalo**:
estado de la ronda, PR y decisiones nuevas. El detalle de cada ronda está en
[`docs/rondas/`](rondas/).

Última actualización: 2026-10-17.

## Estado de las rondas

| Ronda | Alcance | Estado | PR |
| --- | --- | --- | --- |
| 1 | Bugs (escáner, editar/eliminar productos, × descentrada) + radio de alcance en el mapa | Hecha | [#8](https://github.com/pablorr37/almacenia/pull/8) |
| 2 | [Inicio del vendedor y menú de inicio, varias tiendas, empleados y permisos](rondas/ronda-2-inicio-vendedor.md) | Hecha | [#9](https://github.com/pablorr37/almacenia/pull/9) |
| 3 | [Precio = costo + ganancia + impuestos, datos para facturar, balance por plan, plan Plata](rondas/ronda-3-precios-balance.md) | Pendiente | — |
| 4 | [Publicidad: Google + otros proveedores + motor propio de Almacenia](rondas/ronda-4-publicidad.md) | Pendiente | — |
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

Aclaraciones posteriores del usuario:
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
  - los puntos por venta siguen yendo al propietario aunque venda un empleado;
  - valorar clientes y editar los datos de la tienda son solo del propietario;
  - cobrar en el momento pide el permiso `cobrar`.

## Preguntas abiertas

- **Facturación (ronda 3):**
  - condición fiscal de cada tienda (monotributo / responsable inscripto / exento) y alícuotas de IVA por producto (21 %, 10,5 %, 27 %, exento);
  - ¿se integra la factura electrónica de ARCA (ex AFIP) ya, o alcanza con dejar los datos listos?
- **Publicidad (ronda 4):**
  - IDs de Google AdSense/Ad Manager y qué otros proveedores (los configura el usuario);
  - precio y forma de pago de la publicidad en el mapa.
- **Empleados (ronda 2, resuelta con la lista propuesta):** vender, cobrar, anular, precios, stock, productos, fotos, pedidos, balance, usuarios. Si el usuario quiere otros permisos (por ejemplo, separar "ver" de "editar" el stock), se agregan al enum `permiso_tienda` sin cambiar el modelo.
