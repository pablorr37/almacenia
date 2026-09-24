# Módulo: planes (free/premium)

Convenciones comunes: ver [`00-overview.md`](00-overview.md). Depende de
[`02-tiendas.md`](02-tiendas.md).

Este documento define **el mecanismo** de gating por plan, no el listado final de
features premium — se espera que la lista de features gateadas crezca con el
tiempo sin requerir cambios de schema.

## Modelo de datos

`Tienda.plan` (`free` | `premium`, ver `02-tiendas.md`) es el único campo de
schema. No hay tabla de features: la lista de features gateadas vive como
constantes en código (`src/lib/planes/planes.ts`), no en la base de datos, porque
en este MVP no hay UI de admin para editarlas dinámicamente.

## Reglas de negocio

- `plan` nace en `free` para toda tienda nueva.
- El cambio de plan es manual (vía `PATCH /api/admin/tiendas/:id/plan`, `esAdmin`
  requerido) mientras no exista integración de cobro — no hay endpoint de
  self-service para que un vendedor se pase a premium solo.
- **Features gateadas en este MVP** (primera aplicación concreta del mecanismo):
  - `fotos_ilimitadas`: una tienda `free` puede tener foto propia (`imagenUrl`) en
    como máximo 3 productos distintos a la vez; `premium` no tiene límite. No
    aplica a la foto de portada de la tienda ni al avatar de usuario, solo a fotos
    de producto (ver `08-archivos.md`). Reemplazar la foto de un producto que ya
    tiene una no cuenta como una foto nueva contra el límite.
  - `destacado_prioritario`: en `GET /api/tiendas/cercanas` (`02-tiendas.md`), las
    tiendas con `plan = premium` se listan antes que las `free` dentro del mismo
    radio de búsqueda (orden primario por plan, orden secundario por
    `distanciaKm` ascendente dentro de cada grupo). No tiene relación con el flag
    `Producto.destacado` de `03-productos.md`, que es manual y por producto dentro
    de una sola tienda.
- Agregar una feature nueva al gate es: (1) agregarla a `FEATURES` en
  `src/lib/planes/planes.ts`, (2) llamar a `tienePermiso(tienda, 'feature')` donde
  corresponda. No requiere migración de schema.

## Endpoints REST

### `PATCH /api/admin/tiendas/:id/plan`

Requiere `esAdmin = true`. Request: `{ plan: 'free' | 'premium' }`. Response `200`:
`{ data: Tienda }`.

## Firmas de funciones/clases TypeScript

Ubicación: `src/lib/planes/`.

```ts
type Plan = 'free' | 'premium';

type Feature = 'fotos_ilimitadas' | 'destacado_prioritario';

// true si el plan de la tienda habilita esa feature.
function tienePermiso(tienda: { plan: Plan }, feature: Feature): boolean;

// Usada por 11-admin.md — requireAdmin(admin) primero.
async function cambiarPlan(admin: Usuario, tiendaId: string, plan: Plan): Promise<Tienda>;
```

## Casos de error a contemplar

| Código           | Cuándo                                              |
| ------------------ | ------------------------------------------------------|
| `PLAN_INVALIDO`    | `plan` no es `'free'` ni `'premium'`.                |
| `TIENDA_NO_ENCONTRADA` | `tiendaId` no existe en `cambiarPlan`.            |
