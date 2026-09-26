# Módulo: tiendas

Convenciones comunes: ver [`00-overview.md`](00-overview.md). Depende de
[`01-auth.md`](01-auth.md).

## Modelo de datos

```sql
CREATE TYPE categoria AS ENUM (
  'almacen', 'bebidas', 'lacteos', 'panaderia', 'limpieza', 'kiosco', 'verduleria',
  'fiambreria', 'otros'
);

CREATE TYPE plan AS ENUM ('free', 'premium');

CREATE TABLE tiendas (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendedor_id   UUID NOT NULL UNIQUE REFERENCES usuarios(id),
  nombre        TEXT NOT NULL,
  descripcion   TEXT,
  direccion     TEXT NOT NULL,
  ubicacion     GEOGRAPHY(Point, 4326) NOT NULL,
  activa        BOOLEAN NOT NULL DEFAULT true,
  desactivada_en TIMESTAMPTZ,
  imagen_url    TEXT,
  rubro         categoria,
  verificada    BOOLEAN NOT NULL DEFAULT false,
  plan          plan NOT NULL DEFAULT 'free',
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

CREATE TYPE estado_verificacion AS ENUM ('pendiente', 'aprobada', 'rechazada');

CREATE TABLE solicitudes_verificacion (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tienda_id    UUID NOT NULL REFERENCES tiendas(id),
  estado       estado_verificacion NOT NULL DEFAULT 'pendiente',
  creada_en    TIMESTAMPTZ NOT NULL DEFAULT now(),
  revisada_en  TIMESTAMPTZ,
  revisada_por UUID REFERENCES usuarios(id),
  nota_admin   TEXT
);

CREATE INDEX solicitudes_verificacion_tienda_id_idx ON solicitudes_verificacion (tienda_id);
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
- `desactivada_en` guarda la fecha en la que `activa` pasó a `false` por última vez
  (se actualiza cada vez que `actualizarTienda` recibe `activa: false`; se limpia a
  `null` si la tienda se reactiva). Alimenta el reporte de bajas de `11-admin.md` —
  no se puede reconstruir un histórico confiable a partir del solo booleano `activa`.
- `imagen_url` es la foto de portada de la tienda, subida vía `08-archivos.md`. Nace
  en `null`.
- `rubro` es la categoría general de la tienda (almacén, kiosco, verdulería, etc.),
  informativa para el mapa/búsqueda — no limita qué `categoria` pueden tener sus
  productos individuales (ver `03-productos.md`).
- `verificada` nace en `false` en toda alta automática de tienda. Solo cambia a
  `true` cuando un admin aprueba una `SolicitudVerificacion` (ver más abajo) — nunca
  se auto-verifica.
- `plan` determina qué features premium tiene habilitadas la tienda (ver
  `10-planes.md`). Nace en `free`; el cambio a `premium` es manual por un admin
  mientras no haya cobro automatizado.
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
- **Verificación**: el dueño de una tienda no verificada puede crear una
  `SolicitudVerificacion` mientras no tenga ya una `pendiente` (no se permiten
  solicitudes duplicadas en simultáneo). Solo un admin (`esAdmin = true`, ver
  `01-auth.md`) puede revisarla; aprobarla pone `tiendas.verificada = true` en la
  misma operación. Una tienda ya `verificada = true` no puede crear una nueva
  solicitud (`TIENDA_YA_VERIFICADA`).

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
{ data: Array<Tienda & { distanciaKm: number }> }
// Orden: tiendas plan=premium primero (ver 10-planes.md, feature
// destacado_prioritario), luego distanciaKm ascendente dentro de cada grupo.
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

Request (todos los campos opcionales): igual forma que `POST`, más `activa?: boolean`,
`imagenUrl?: string`, `rubro?: Categoria`.

Response `200`: `{ data: Tienda }`. Si `activa` pasa de `true` a `false`, setea
`desactivadaEn = now()`; si pasa a `true`, limpia `desactivadaEn = null`.

### `POST /api/tiendas/:id/verificacion`

Requiere ser el dueño de la tienda. Crea una `SolicitudVerificacion` en estado
`pendiente`. Response `201`: `{ data: SolicitudVerificacion }`.
`409 SOLICITUD_YA_PENDIENTE` si ya hay una pendiente.
`409 TIENDA_YA_VERIFICADA` si la tienda ya está verificada.

### `GET /api/admin/verificaciones` y `PATCH /api/admin/verificaciones/:id`

Ver `11-admin.md` — requieren `esAdmin = true`.

## Firmas de funciones/clases TypeScript

Ubicación: `src/lib/tiendas/`.

```ts
type MedioPago = 'efectivo' | 'transferencia' | 'mercado_pago' | 'debito' | 'qr';

interface HorarioTienda {
  diaSemana: number; // 0=domingo .. 6=sábado
  abre: string | null; // "HH:mm"
  cierra: string | null;
}

type Categoria =
  | 'almacen' | 'bebidas' | 'lacteos' | 'panaderia' | 'limpieza' | 'kiosco'
  | 'verduleria' | 'fiambreria' | 'otros';

type Plan = 'free' | 'premium';

interface Tienda {
  id: string;
  vendedorId: string;
  nombre: string;
  descripcion: string | null;
  direccion: string;
  lat: number;
  lon: number;
  activa: boolean;
  desactivadaEn: string | null; // ISO datetime
  imagenUrl: string | null;
  rubro: Categoria | null;
  verificada: boolean;
  plan: Plan;
  mediosDePago: MedioPago[];
  horarios: HorarioTienda[]; // 0 o 7 entradas
}

type EstadoVerificacion = 'pendiente' | 'aprobada' | 'rechazada';

interface SolicitudVerificacion {
  id: string;
  tiendaId: string;
  estado: EstadoVerificacion;
  creadaEn: string;
  revisadaEn: string | null;
  revisadaPor: string | null;
  notaAdmin: string | null;
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
  imagenUrl?: string;
  rubro?: Categoria;
  mediosDePago?: MedioPago[];
  horarios?: HorarioTienda[]; // si se manda, reemplaza las 7 filas existentes
}

async function actualizarTienda(
  vendedor: Usuario,
  tiendaId: string,
  input: ActualizarTiendaInput
): Promise<Tienda>;

async function solicitarVerificacion(
  vendedor: Usuario,
  tiendaId: string
): Promise<SolicitudVerificacion>;

// Usada por 11-admin.md — requireAdmin(admin) primero.
async function revisarSolicitudVerificacion(
  admin: Usuario,
  solicitudId: string,
  decision: 'aprobada' | 'rechazada',
  notaAdmin?: string
): Promise<SolicitudVerificacion>;
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
| `SOLICITUD_YA_PENDIENTE`     | La tienda ya tiene una `SolicitudVerificacion` en estado `pendiente`. |
| `TIENDA_YA_VERIFICADA`       | La tienda ya tiene `verificada = true` al pedir una nueva solicitud. |
| `SOLICITUD_NO_ENCONTRADA`    | `:id` de `SolicitudVerificacion` no existe (`revisarSolicitudVerificacion`). |

## Extensión: estado de apertura, check-in GPS y visita a la página

### Estado de apertura (abierta / cerrada)

Regla derivada (no hay columna): se calcula a partir de `horarios` y de la hora
actual **en la zona horaria del negocio**, `America/Argentina/San_Juan` (constante
`ZONA_HORARIA_NEGOCIO`, compartida con `12-gamificacion.md`).

- Si la tienda no tiene horarios cargados (0 filas), el estado es `desconocido`
  (la UI no muestra pill de abierto/cerrado, solo "Horario no informado").
- Está **abierta** si hoy es un día abierto y `abre <= horaActual < cierra`. En ese
  caso se informa `cierraA` (`"HH:mm"` de hoy).
- Está **cerrada** en cualquier otro caso. Se informa `proximaApertura`: el primer
  `{ diaSemana, hora }` a partir de "ahora" en que abre (hoy más tarde si todavía no
  abrió, si no el siguiente día abierto, dando la vuelta a la semana). Si los 7 días
  están cerrados, `proximaApertura = null`.
- La UI lo muestra así: abierta → "Abierto · Cierra a las 21:00"; cerrada →
  "Cerrado · Abre a las 09:00" (hoy), "Cerrado · Abre mañana 09:00" (mañana) o
  "Cerrado · Abre el lunes 09:00" (otro día).

Se calcula en el cliente (el mapa ya recibe `horarios` en
`GET /api/tiendas/cercanas`) y en el servidor (filtro "solo abiertas ahora" de
`15-itinerario.md`) con la misma función pura.

### `POST /api/tiendas/:id/checkin`

Requiere sesión válida (`esComprador`). Request: `{ lat: number; lon: number }` (la
ubicación GPS actual del navegador del comprador).

Valida que el comprador esté a **≤ 100 m** de la tienda (`ST_Distance` sobre
`geography`, constante `RADIO_CHECKIN_METROS = 100`). Si está dentro, guarda un
`CheckInTienda` y delega en `12-gamificacion.md` (`checkin_gps`, crédito
retroactivo de `visita_compra`). El dueño de la tienda no puede hacer check-in en
su propia tienda.

Response `201`: `{ data: { checkIn: CheckInTienda; puntosOtorgados: number } }`
(`puntosOtorgados` puede ser 0 si ya hizo check-in hoy en esa tienda).

```sql
CREATE TABLE checkins_tienda (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comprador_id  UUID NOT NULL REFERENCES usuarios(id),
  tienda_id     UUID NOT NULL REFERENCES tiendas(id),
  distancia_m   NUMERIC(8, 1) NOT NULL,
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX checkins_tienda_comprador_tienda_idx ON checkins_tienda (comprador_id, tienda_id, creado_en);
```

No se guardan las coordenadas crudas del comprador (solo la distancia calculada),
por privacidad. Limitación conocida: la ubicación del navegador puede falsearse;
la mitigación (antifraude, reglas de velocidad entre check-ins) queda para una
fase futura.

### `POST /api/tiendas/:id/visita`

Requiere sesión válida. Lo llama la página de la tienda al abrirse (comprador
logueado). Delegado a `12-gamificacion.md` (`visita_pagina`). Response `200`:
`{ data: { puntosOtorgados: number } }` (0 si ya puntuó este mes, o si el usuario es
el dueño de la tienda).

### Firmas adicionales

Ubicación: `src/lib/tiendas/horarios.ts` y `src/lib/tiendas/checkin.ts`.

```ts
const ZONA_HORARIA_NEGOCIO = 'America/Argentina/San_Juan';

type EstadoApertura =
  | { estado: 'desconocido' }
  | { estado: 'abierta'; cierraA: string }
  | { estado: 'cerrada'; proximaApertura: { diaSemana: number; hora: string; enDias: number } | null };

// Pura. `ahora` es un Date absoluto; se convierte a día/hora local de `zona`.
// `enDias`: 0 = hoy, 1 = mañana, etc.
function estadoApertura(horarios: HorarioTienda[], ahora: Date, zona?: string): EstadoApertura;

// Texto para la UI ("Abierto · Cierra a las 21:00", "Cerrado · Abre mañana 09:00").
function textoEstadoApertura(estado: EstadoApertura): string;

interface CheckInTienda { id: string; compradorId: string; tiendaId: string; distanciaM: number; creadoEn: string }

async function hacerCheckIn(
  comprador: Usuario,
  tiendaId: string,
  ubicacion: { lat: number; lon: number }
): Promise<{ checkIn: CheckInTienda; puntosOtorgados: number }>;
```

### Errores adicionales

| Código                    | Cuándo                                                        |
| -------------------------- | ---------------------------------------------------------------|
| `CHECKIN_FUERA_DE_RANGO`   | El comprador está a más de `RADIO_CHECKIN_METROS` de la tienda (`409`). |
| `CHECKIN_TIENDA_PROPIA`    | El dueño intenta hacer check-in en su propia tienda (`409`).   |
