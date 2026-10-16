# Ronda 2: menú de inicio, inicio del vendedor, varias tiendas, empleados y permisos

Estado: **pendiente** (borrador). Ver el pedido textual en [`../memoria.md`](../memoria.md), punto 7.

## Objetivo
- **Pantalla de inicio = menú**, con accesos a cada función o grupo de funciones:
  - el **comprador logueado** tiene el Mapa como una opción más (y probablemente la principal);
  - el **visitante sin sesión** ve la lista de negocios cercanos (hoy, `HomeInvitado`);
  - el **vendedor** entra a su tienda, con un menú propio.
- **Menú del vendedor** (que reemplaza las pestañas de `/mi-tienda`):
  - **Nueva venta**: el punto de venta actual;
  - **Stock**: alta, baja y modificación de productos y stock (hoy, la pestaña Productos);
  - **Pedidos**;
  - **Usuarios**: empleados, encargados y permisos;
  - **Balance**: lo arma la ronda 3; en esta ronda, un acceso con lo básico;
  - **Mi tienda**: datos, horarios, rubro y plan;
  - **Mapa**: ver como comprador.
- **Varias tiendas por dueño:**
  - hoy `tiendas.vendedor_id` es UNIQUE y hay que sacarlo;
  - selector de tienda activa;
  - alta de una sucursal nueva.
- **Empleados y permisos:**
  - el **propietario** suma usuarios existentes de la app a una de sus tiendas, por email o con el código QR de "Compartir mis datos";
  - rol **encargado** o **empleado**;
  - **permisos por usuario y tienda**, que el dueño da o quita;
  - el dueño tiene todos los permisos y no se le pueden quitar.

## Permisos propuestos (a confirmar)
| Permiso | Qué habilita |
| --- | --- |
| `vender` | crear ventas en el punto de venta |
| `cobrar` | marcar una venta como cobrada |
| `anular` | anular ventas |
| `precios` | cambiar precio y oferta |
| `stock` | cambiar el stock |
| `productos` | alta, baja y edición de productos |
| `fotos` | cambiar fotos |
| `pedidos` | confirmar, rechazar y entregar pedidos |
| `balance` | ver el balance |
| `usuarios` | gestionar empleados (por defecto solo el dueño) |

## Impacto técnico (relevado)
- `verificarPropiedad` (`src/lib/productos/productos.ts`), `crearVentaPresencial` y `transicionarVenta` (`src/lib/ventas`), pedidos y tiendas comprueban hoy `tienda.vendedorId === usuario.id`.
- Hay que reemplazar esa comprobación por un `exigirPermiso(usuario, tiendaId, permiso)` central.
- Nueva tabla `miembros_tienda (tienda_id, usuario_id, rol, permisos[])`.
- `GET /api/tiendas/mia` pasa a `GET /api/tiendas/mias` (lista) más la tienda activa.
- Se reescribe la UI de `/mi-tienda`.
- Spec nueva: `specs/sdd/19-equipo-tienda.md`.
