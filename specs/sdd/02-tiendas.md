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

CREATE TYPE medio_pago AS ENUM (
  'efectivo', 'transferencia', 'mercado_pago', 'debito', 'qr'
);

ALTER TABLE tiendas ADD COLUMN medios_de_pago medio_pago[] NOT NULL DEFAULT '{}';

CREATE TABLE horarios_tienda (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tienda_id   UUID NOT NULL REFERENCES tiendas(id),
  dia_semana  SMALLINT NOT NULL, -- 0=domingo .. 6=sábado
  abre        TEXT, -- "HH:mm", NULL si cerrado ese día
  cierra      TEXT, -- "HH:mm", NULL si cerrado ese día
  CONSTRAINT dia_semana_valido CHECK (dia_semana BETWEEN 0 AND 6),
  CONSTRAINT horarios_tienda_tienda_dia_key UNIQUE (tienda_id, dia_semana)
);

CREATE INDEX horarios_tienda_tienda_id_idx ON horarios_tienda (tienda_id);
```

- `vendedor_id UNIQUE` implementa la relación 1:1 vendedor–tienda del MVP (ver
  `00-overview.md`).
- `ubicacion` guarda `(longitud, latitud)` como `POINT` geográfico — permite usar
  `ST_DWithin`/`ST_Distance` de PostGIS para búsquedas por cercanía sin calcular
  Haversine a mano en la aplicación.
- `activa` permite que un vendedor oculte temporalmente su tienda del mapa sin
  borrarla (no hay borrado físico de tiendas en el MVP).
- `medios_de_pago` es un array del enum `medio_pago` — una tienda puede aceptar
  varios a la vez, sin tabla aparte (no hay atributos propios por medio de pago en
  el MVP, un array alcanza).
- `horarios_tienda` guarda **una fila por día de la semana** (0 a 6, siempre las 7
  presentes para una tienda con horario cargado) — `abre`/`cierra` en formato
  `"HH:mm"` como texto simple (no `TIME` de Postgres, para no lidiar con
  zonas horarias/fechas ficticias del lado de la aplicación); ambos `NULL` en una
  fila significa que la tienda está cerrada ese día. Una tienda recién creada
  puede no tener filas de horario todavía (es opcional al crear/editar).

## Reglas de negocio

- **Cualquier usuario autenticado** puede crear una tienda (no hace falta tener ya
  `esVendedor = true`: crear la tienda es justamente lo que lo activa, ver
  `01-auth.md`), y solo puede tener una (constraint `UNIQUE` en `vendedor_id`).
- `crearTienda` es transaccional con `activarVendedor` (`01-auth.md`): crear la fila en
  `tiendas` y poner `usuarios.es_vendedor = true` ocurre en una única operación — no
  puede quedar una tienda creada con el usuario todavía en `es_vendedor = false`.
- `ubicacion` es obligatoria al crear la tienda — no existe una tienda "sin ubicar" en
  el mapa. Latitud debe estar en `[-90, 90]`, longitud en `[-180, 180]`.
- Solo el `vendedor_id` dueño de la tienda puede editarla o desactivarla.
- Una tienda `activa = false` no aparece en las búsquedas del comprador
  (`GET /api/tiendas/cercanas`) pero sigue siendo editable por su dueño y sigue
  existiendo para el historial de ventas/pedidos ya realizados.
- `horarios` es opcional tanto en `crearTienda` como en `actualizarTienda`; cuando
  se manda, **tiene que traer exactamente las 7 entradas** (una por `diaSemana`,
  0 a 6, sin repetidos) — no se permite mandar un subconjunto de días. Cada entrada
  es `{ diaSemana, abre, cierra }`; si el día está cerrado, `abre` y `cierra` son
  ambos `null`; si está abierto, ambos son un string `"HH:mm"` válido y `abre` tiene
  que ser estrictamente anterior a `cierra` (no se contemplan horarios que cruzan la
  medianoche, ej. locales 24hs se modelan con `abre`/`cierra` ambos `null` — "no
  tiene horario de cierre" en la práctica se representa igual que "cerrado" a nivel
  de dato; es la UI la que distingue "24 horas" de "cerrado" con un campo aparte si
  hiciera falta más adelante, no forma parte de este MVP).
- Al actualizar `horarios`, se reemplazan las 7 filas existentes por las nuevas (no
  hay edición parcial de un solo día vía API — el cliente manda el estado completo
  de la semana).

## Endpoints REST

### `POST /api/tiendas`

Requiere sesión válida, sin tienda propia todavía (no requiere `esVendedor = true`
de antemano — este endpoint es lo que lo activa).

Request:

```ts
{
  nombre: string;
  descripcion?: string;
  direccion: string;
  lat: number;
  lon: number;
  mediosDePago?: MedioPago[];
  horarios?: Array<{ diaSemana: number; abre: string | null; cierra: string | null }>;
}
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

### `GET /api/tiendas/mia`

Requiere sesión válida. Devuelve la tienda del usuario autenticado (relación 1:1
vendedor–tienda del MVP, ver arriba) — es la forma en la que el panel del vendedor
resuelve su propia tienda sin conocer de antemano el `id`, en vez de guardarlo por su
cuenta (ej. `localStorage`) en el cliente.

Response `200`: `{ data: Tienda }`. `404 TIENDA_NO_ENCONTRADA` si el usuario todavía
no creó su tienda.

### `PATCH /api/tiendas/:id`

Requiere ser el dueño de la tienda (`vendedor_id === usuario.id`).

Request (todos los campos opcionales): igual forma que `POST`, más `activa?: boolean`.

Response `200`: `{ data: Tienda }`.

## Firmas de funciones/clases TypeScript

Ubicación: `src/lib/tiendas/`.

```ts
type MedioPago = 'efectivo' | 'transferencia' | 'mercado_pago' | 'debito' | 'qr';

interface HorarioTienda {
  diaSemana: number; // 0=domingo .. 6=sábado
  abre: string | null; // "HH:mm"
  cierra: string | null;
}

interface Tienda {
  id: string;
  vendedorId: string;
  nombre: string;
  descripcion: string | null;
  direccion: string;
  lat: number;
  lon: number;
  activa: boolean;
  mediosDePago: MedioPago[];
  horarios: HorarioTienda[]; // 0 o 7 entradas
}

interface CrearTiendaInput {
  nombre: string;
  descripcion?: string;
  direccion: string;
  lat: number;
  lon: number;
  mediosDePago?: MedioPago[];
  horarios?: HorarioTienda[]; // si se manda, deben ser exactamente 7
}

// Valida la forma de `horarios`: exactamente 7 entradas, diaSemana 0-6 sin
// repetidos, y por cada una: ambos null (cerrado) o ambos "HH:mm" válidos con
// abre < cierra. Usada por crearTienda/actualizarTienda y testeada aislada.
function horarioValido(horarios: HorarioTienda[]): boolean;

// Crea la tienda y activa esVendedor=true en el usuario, en una única transacción
// (llama internamente a activarVendedor de 01-auth.md).
async function crearTienda(usuario: Usuario, input: CrearTiendaInput): Promise<Tienda>;

interface BuscarTiendasCercanasInput {
  lat: number;
  lon: number;
  radioKm?: number; // default 5
}

async function buscarTiendasCercanas(
  input: BuscarTiendasCercanasInput
): Promise<Array<Tienda & { distanciaKm: number }>>;

async function obtenerTienda(id: string): Promise<Tienda | null>;

async function obtenerTiendaPorVendedor(vendedorId: string): Promise<Tienda | null>;

interface ActualizarTiendaInput {
  nombre?: string;
  descripcion?: string;
  direccion?: string;
  lat?: number;
  lon?: number;
  activa?: boolean;
  mediosDePago?: MedioPago[];
  horarios?: HorarioTienda[]; // si se manda, reemplaza las 7 filas existentes
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
| `USUARIO_YA_TIENE_TIENDA`    | El usuario ya tiene una tienda creada (`POST /api/tiendas`). |
| `UBICACION_INVALIDA`         | `lat`/`lon` fuera de rango o faltantes al crear.               |
| `TIENDA_NO_ENCONTRADA`       | `:id` no existe.                                                |
| `NO_ES_DUENO_DE_TIENDA`      | El usuario autenticado intenta editar una tienda que no es la suya. |
| `RADIO_INVALIDO`             | `radioKm` <= 0 o > 50 en la búsqueda por cercanía.              |
| `HORARIO_INVALIDO`           | `horarios` no trae exactamente 7 entradas, `diaSemana` repetido o fuera de 0-6, formato de hora inválido, o `abre >= cierra` en un día abierto. |
| `MEDIO_PAGO_INVALIDO`        | Algún valor de `mediosDePago` no es uno de los valores del enum `MedioPago` (el request llega como JSON sin tipar, hay que validarlo en runtime). |
