# Módulo: tiendas

Convenciones comunes: ver [`00-overview.md`](00-overview.md). Depende de
[`01-auth.md`](01-auth.md).

## Modelo de datos

```sql
CREATE TABLE tiendas (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendedor_id   UUID NOT NULL UNIQUE REFERENCES usuarios(id),
  nombre        TEXT NOT NULL,
  descripcion   TEXT,
  direccion     TEXT NOT NULL,
  ubicacion     GEOGRAPHY(Point, 4326) NOT NULL,
  activa        BOOLEAN NOT NULL DEFAULT true,
  creada_en     TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizada_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX tiendas_ubicacion_gist_idx ON tiendas USING GIST (ubicacion);
```

- `vendedor_id UNIQUE` implementa la relación 1:1 vendedor–tienda del MVP (ver
  `00-overview.md`).
- `ubicacion` guarda `(longitud, latitud)` como `POINT` geográfico — permite usar
  `ST_DWithin`/`ST_Distance` de PostGIS para búsquedas por cercanía sin calcular
  Haversine a mano en la aplicación.
- `activa` permite que un vendedor oculte temporalmente su tienda del mapa sin
  borrarla (no hay borrado físico de tiendas en el MVP).

## Reglas de negocio

- Solo un usuario con `rol = 'vendedor'` puede crear una tienda, y solo puede tener
  una (constraint `UNIQUE` en `vendedor_id`).
- `ubicacion` es obligatoria al crear la tienda — no existe una tienda "sin ubicar" en
  el mapa. Latitud debe estar en `[-90, 90]`, longitud en `[-180, 180]`.
- Solo el `vendedor_id` dueño de la tienda puede editarla o desactivarla.
- Una tienda `activa = false` no aparece en las búsquedas del comprador
  (`GET /api/tiendas/cercanas`) pero sigue siendo editable por su dueño y sigue
  existiendo para el historial de ventas/pedidos ya realizados.

## Endpoints REST

### `POST /api/tiendas`

Rol requerido: `vendedor`, sin tienda propia todavía.

Request:

```ts
{ nombre: string; descripcion?: string; direccion: string; lat: number; lon: number }
```

Response `201`: `{ data: Tienda }`

### `GET /api/tiendas/cercanas`

Público (no requiere sesión — el mapa del comprador puede mostrarse sin login).

Query: `?lat=<number>&lon=<number>&radioKm=<number>` (default `radioKm=5`, máximo `50`).

Response `200`:

```ts
{ data: Array<Tienda & { distanciaKm: number }> } // ordenado por distanciaKm ascendente
```

### `GET /api/tiendas/:id`

Público. Response `200`: `{ data: Tienda }`. `404 TIENDA_NO_ENCONTRADA` si no existe.

### `PATCH /api/tiendas/:id`

Rol requerido: `vendedor`, dueño de la tienda (`vendedor_id === usuario.id`).

Request (todos los campos opcionales): igual forma que `POST`, más `activa?: boolean`.

Response `200`: `{ data: Tienda }`.

## Firmas de funciones/clases TypeScript

Ubicación: `src/lib/tiendas/`.

```ts
interface Tienda {
  id: string;
  vendedorId: string;
  nombre: string;
  descripcion: string | null;
  direccion: string;
  lat: number;
  lon: number;
  activa: boolean;
}

interface CrearTiendaInput {
  nombre: string;
  descripcion?: string;
  direccion: string;
  lat: number;
  lon: number;
}

async function crearTienda(vendedor: Usuario, input: CrearTiendaInput): Promise<Tienda>;

interface BuscarTiendasCercanasInput {
  lat: number;
  lon: number;
  radioKm?: number; // default 5
}

async function buscarTiendasCercanas(
  input: BuscarTiendasCercanasInput
): Promise<Array<Tienda & { distanciaKm: number }>>;

async function obtenerTienda(id: string): Promise<Tienda | null>;

interface ActualizarTiendaInput {
  nombre?: string;
  descripcion?: string;
  direccion?: string;
  lat?: number;
  lon?: number;
  activa?: boolean;
}

async function actualizarTienda(
  vendedor: Usuario,
  tiendaId: string,
  input: ActualizarTiendaInput
): Promise<Tienda>;
```

## Casos de error a contemplar

| Código                      | Cuándo                                                        |
| ---------------------------- | ---------------------------------------------------------------|
| `USUARIO_YA_TIENE_TIENDA`    | El vendedor ya tiene una tienda creada (`POST /api/tiendas`). |
| `ROL_INVALIDO`                | Un `comprador` intenta crear/editar una tienda.                |
| `UBICACION_INVALIDA`         | `lat`/`lon` fuera de rango o faltantes al crear.               |
| `TIENDA_NO_ENCONTRADA`       | `:id` no existe.                                                |
| `NO_ES_DUENO_DE_TIENDA`      | El usuario autenticado intenta editar una tienda que no es la suya. |
| `RADIO_INVALIDO`             | `radioKm` <= 0 o > 50 en la búsqueda por cercanía.              |
