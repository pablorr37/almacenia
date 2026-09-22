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

Fuera de este MVP (a especificar después, ver `agents/memory/decisiones/stack-app.md`):
promociones, balance/reportes, itinerario óptimo multi-tienda, listas de pendientes del
comprador, chat in-app.

## Diagrama de entidades (MVP)

```
Usuario (rol: vendedor | comprador)
  └─< Tienda (1 vendedor -> 1 tienda, MVP simple)
        └─< Producto (stock, precio)
        └─< Pedido >── Usuario (comprador)
              └─< ItemPedido >── Producto
        └─< Venta >── Usuario (comprador, nullable) ── Pedido (nullable)
              └─< ItemVenta >── Producto
```

Relación 1 vendedor : 1 tienda para simplificar el MVP (un `Usuario` con rol `vendedor`
gestiona una única `Tienda`). Pasar a N tiendas por vendedor no rompe este modelo: solo
cambia la cardinalidad de `Tienda.vendedor_id`, no hace falta anticiparlo ahora.

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

### Autenticación

Toda ruta bajo `/api/**` salvo las explícitamente marcadas como públicas en cada spec
de módulo requiere sesión válida (NextAuth). El rol del usuario autenticado (`vendedor`
o `comprador`) determina qué operaciones puede hacer — cada spec de módulo indica el rol
requerido por endpoint. Las funciones de servicio (capa `lib/`) reciben el usuario
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
