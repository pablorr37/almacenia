# Almacenia — SDD (Spec-Driven Development), MVP

Documento raíz del SDD del proyecto. Fija las convenciones comunes a todos los módulos
para no repetirlas en cada spec. Las specs de módulo (`01-auth.md` en adelante) asumen
todo lo que está acá.

## Módulos del MVP

1. [`01-auth.md`](01-auth.md) — Usuario, roles, sesión.
2. [`02-tiendas.md`](02-tiendas.md) — alta de tienda por geolocalización, perfil.
3. [`03-productos.md`](03-productos.md) — catálogo, precio, stock, disponibilidad.
4. [`04-pedidos.md`](04-pedidos.md) — pedido a distancia, confirmación, retiro en local.
5. [`05-ventas.md`](05-ventas.md) — venta (presencial o a distancia), débito de stock.

Módulos agregados después del MVP inicial:

6. [`06-catalogo.md`](06-catalogo.md) — catálogo compartido de productos y su foto.
7. [`07-resenas.md`](07-resenas.md) — reseñas de comprador a tienda/producto.
8. [`08-archivos.md`](08-archivos.md) — subida de imágenes a S3.
9. [`10-planes.md`](10-planes.md) — planes free/premium y gating de features.
10. [`11-admin.md`](11-admin.md) — panel admin y configuración del sistema.
11. [`12-gamificacion.md`](12-gamificacion.md) — puntos por acciones de vendedores y compradores.
12. [`13-valoraciones-clientes.md`](13-valoraciones-clientes.md) — el dueño de la tienda valora a sus clientes.
13. [`14-listas-compras.md`](14-listas-compras.md) — listas de compras del comprador.
14. [`15-itinerario.md`](15-itinerario.md) — "Buscar y comparar": planes de compra
    multi-tienda por precio + distancia. **Se implementa por fases según la
    infraestructura disponible** (fase 1 hecha; ver la spec y
    [`docs/roadmap-itinerario.md`](../../docs/roadmap-itinerario.md)).
15. [`16-banco-fotos.md`](16-banco-fotos.md) — banco de fotos curado (búsqueda de
    fotos libres en la web, aprobación por admin/testers, misma UI para todos).
16. [`17-rubros-categorias.md`](17-rubros-categorias.md) — rubros de negocio y
    categorías de producto que mantiene el admin.

Todavía fuera de alcance (a especificar después): promociones, balance/reportes,
entrega a domicilio (delivery), chat in-app, y las fases 2 a 6 del itinerario.

## Diagrama de entidades (MVP)

```
Usuario (esComprador, esVendedor — independientes, ver 01-auth.md)
  └─< Tienda (propietario; varias por usuario; crearla activa esVendedor=true)
        └─< MiembroTienda >── Usuario (encargado/empleado con permisos)
        └─< Producto (stock, precio)
        └─< Pedido >── Usuario (comprador)
              └─< ItemPedido >── Producto
        └─< Venta >── Usuario (comprador, nullable) ── Pedido (nullable)
              └─< ItemVenta >── Producto
```

Un usuario puede ser propietario de varias tiendas y miembro (encargado o empleado,
con permisos) de otras: ver [`19-equipo-tienda.md`](19-equipo-tienda.md).

## Stack técnico (ver `agents/memory/decisiones/stack-app.md`)

Next.js (TypeScript, app router) para frontend + API routes, PostgreSQL + PostGIS,
Leaflet/MapLibre GL para el mapa.

## Convenciones comunes

### Identificadores

Todas las entidades usan `id: string` (UUID v4) como primary key. No se usan IDs
autoincrementales.

### Formato de respuesta de la API

Éxito:

```ts
{ data: T }
```

Error:

```ts
{ error: { code: string; message: string; details?: Record<string, unknown> } }
```

`code` es un identificador estable en `SCREAMING_SNAKE_CASE` (ej. `PRODUCTO_SIN_STOCK`,
`TIENDA_NO_ENCONTRADA`) que el frontend puede usar para lógica condicional sin parsear
el mensaje. `message` es el texto legible en español. Cada spec de módulo lista sus
propios códigos en la sección "Casos de error a contemplar".

Status HTTP: `200` (éxito con body), `201` (creación), `400` (validación), `401` (no
autenticado), `403` (autenticado pero sin permiso sobre el recurso), `404` (no existe),
`409` (conflicto de estado, ej. stock insuficiente o transición de estado inválida).

**Sin caché:** toda respuesta de la API (éxito o error) lleva `Cache-Control: no-store`.
Son datos vivos (stock, tiendas visibles, estados de cuenta): ni el navegador ni un
proxy/CDN delante de la app (Cloudflare, Traefik) pueden servir una copia vieja. Ej.:
una tienda de una cuenta pausada o eliminada desaparece del mapa en la próxima carga.
El mapa además vuelve a pedir las tiendas cuando la pestaña recupera el foco.

### Autenticación

Toda ruta bajo `/api/**` salvo las explícitamente marcadas como públicas en cada spec
de módulo requiere sesión válida (NextAuth). Los flags `esComprador`/`esVendedor` del
usuario autenticado (ver `01-auth.md`) determinan qué operaciones puede hacer — no son
excluyentes, un mismo usuario puede cumplir ambos. Cada spec de módulo indica qué flag
requiere cada endpoint (y, cuando aplica, que además sea el dueño del recurso, ej. el
vendedor de la tienda). Las funciones de servicio (capa `lib/`) reciben el usuario
autenticado como parámetro explícito, nunca lo leen de un contexto global implícito,
para que sean testeables de forma aislada.

### Paginación

Listados devuelven:

```ts
{ data: T[]; page: number; pageSize: number; total: number }
```

Parámetros de query: `?page=1&pageSize=20` (default `page=1`, `pageSize=20`, máximo
`pageSize=100`).

### Ubicación en el código

- `src/lib/<modulo>/` — lógica de negocio y acceso a datos del módulo (funciones puras
  o casi-puras, sin depender de Next.js request/response).
- `src/app/api/<modulo>/` — API routes que llaman a `src/lib/<modulo>/`, se encargan de
  parsear el request, chequear auth/rol y mapear errores al formato de respuesta.
- `src/lib/<modulo>/<modulo>.test.ts` — tests del módulo (Vitest).

Esto es lo que las specs de módulo asumen al listar "firmas de funciones/clases
TypeScript": vas a encontrarlas en `src/lib/<modulo>/`.
