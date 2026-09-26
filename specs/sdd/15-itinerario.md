# Módulo: itinerario de compra ("Buscar y comparar")

Convenciones comunes: ver [`00-overview.md`](00-overview.md). Depende de
[`02-tiendas.md`](02-tiendas.md) (tiendas cercanas, estado de apertura),
[`03-productos.md`](03-productos.md) (precio, stock), [`06-catalogo.md`](06-catalogo.md),
[`11-admin.md`](11-admin.md) (configuración) y
[`14-listas-compras.md`](14-listas-compras.md).

> **Este módulo se implementa por fases, según las posibilidades concretas de
> infraestructura que haya en cada momento.** Esta spec define completa la **fase 1**
> (implementada) y deja descritas las siguientes con lo que cada una necesita.
> Cada fase nueva se especifica acá en detalle antes de implementarse (SDD), y no
> rompe el contrato de la anterior: los planes sólo ganan criterios nuevos.
> Resumen ejecutivo de la hoja de ruta: [`docs/roadmap-itinerario.md`](../../docs/roadmap-itinerario.md).

## Objetivo

Dada una lista de productos (guardada o no) y la ubicación del comprador, decirle
**en qué tiendas cercanas conviene comprar qué**, armando "planes de compra"
(itinerarios) que combinan precio y distancia. En el futuro se suman descuentos y
promociones, valoración y verificación de la tienda, y "conveniencia" (cuándo y
por dónde se mueve el comprador).

## Fase 1 — precio + distancia en línea recta (implementada)

### Infraestructura

Alcanza con lo que ya hay: **PostgreSQL + PostGIS** (tiendas en radio con
`ST_DWithin`, índice GIST sobre `tiendas.ubicacion`) y el cálculo **en memoria en el
server de Next.js**, dentro del request. No hacen falta jobs, colas, caché ni
servicios externos. Se agrega el índice `productos (catalogo_id, disponible)`
para la consulta de ofertas.

Cotas que mantienen el cálculo en milisegundos: radio ≤ 50 km, ≤ 100 ítems por lista,
≤ 15 tiendas candidatas, ≤ 3 tiendas por plan → a lo sumo
C(15,1)+C(15,2)+C(15,3) = 575 combinaciones evaluadas.

### Algoritmo

Entrada: ítems `{ catalogoId, cantidad }[]`, origen `{ lat, lon }`, `radioKm`
(default 5, máx 50), `soloAbiertas` (default `false`), `maxTiendas` (1–3, default 3).

1. **Tiendas en radio**: `buscarTiendasCercanas` (`02-tiendas.md`, sólo activas).
   Si `soloAbiertas`, se filtran con `estadoApertura(...).estado === 'abierta'`.
2. **Ofertas**: una sola query de `Producto` con `tiendaId IN (tiendas)`,
   `catalogoId IN (ítems)`, `disponible = true` y `stock >= cantidad pedida` de ese
   ítem (una tienda con stock parcial no cuenta como oferta del ítem en la fase 1).
   Precio unitario efectivo = `precioOferta ?? precio`. Si una tienda tiene más de
   un `Producto` con el mismo `catalogoId`, se toma el más barato.
3. **Candidatas**: tiendas con ≥ 1 oferta, ordenadas por (ítems cubiertos desc,
   distancia asc); se quedan las primeras 15.
4. **Evaluar un conjunto S de tiendas** (|S| ≤ `maxTiendas`):
   - Cada ítem se asigna a la tienda de S con menor precio unitario (empate → la más
     cercana al origen). Ítems sin oferta en S → `faltantes`.
   - Las tiendas de S sin ningún ítem asignado se descartan del plan.
   - **Recorrido**: desde el origen, vecino más cercano entre las paradas (distancia
     haversine en línea recta), sin volver al origen. `distanciaKm` = suma de tramos.
   - `subtotal` = Σ precio unitario × cantidad.
   - `costoDistancia` = `distanciaKm × costoKm` (config `itinerario.costo_km`,
     default 300 ARS/km, `11-admin.md`) — convierte la distancia en plata para poder
     compararla con el ahorro de precio.
   - `costoTotal` = `subtotal + costoDistancia`.
5. **Planes** (siempre se prioriza cubrir más ítems de la lista):
   - `una_tienda` — "Todo en un lugar": |S| = 1; máx. cobertura, después menor
     `costoTotal`.
   - `mas_barato` — "Precio más bajo": |S| ≤ `maxTiendas`; máx. cobertura, después
     menor `subtotal`, después menor `distanciaKm`.
   - `equilibrado` — "Mejor equilibrio": |S| ≤ `maxTiendas`; máx. cobertura, después
     menor `costoTotal`.
   - Si dos planes resultan en las mismas paradas, se devuelven como uno solo con
     ambas etiquetas.
   - `ahorroVsUnaTienda` = `subtotal(una_tienda) − subtotal(plan)` cuando ambos cubren
     la misma cantidad de ítems; si no, `null`.
6. **Comparativa**: por ítem, todas las ofertas encontradas ordenadas por precio
   (tabla producto × tienda para que el comprador vea los precios directamente).

Si no hay ninguna oferta para ningún ítem, `planes = []` y todos los ítems van en
`sinOfertas`.

### Endpoints REST

#### `POST /api/listas/:id/comparar`

Requiere sesión (dueño de la lista, `14-listas-compras.md`). Request:
`{ lat: number; lon: number; radioKm?: number; soloAbiertas?: boolean; maxTiendas?: number }`.
Response `200`: `{ data: ResultadoComparacion }`.

#### `POST /api/itinerario/comparar`

Requiere sesión. Igual, pero con `items: Array<{ catalogoId; cantidad }>` en el body
en lugar de una lista guardada.

### Firmas de funciones/clases TypeScript

Ubicación: `src/lib/itinerario/`.

```ts
type TipoPlan = 'una_tienda' | 'mas_barato' | 'equilibrado';

interface TiendaCandidata {
  id: string;
  nombre: string;
  direccion: string;
  lat: number;
  lon: number;
  distanciaKm: number; // desde el origen
  verificada: boolean;
  estadoApertura: EstadoApertura; // 02-tiendas.md
}

interface Oferta {
  tiendaId: string;
  catalogoId: string;
  productoId: string;
  precioUnitario: number;
}

interface ItemPlan {
  catalogoId: string;
  productoId: string;
  nombre: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
}

interface ParadaPlan {
  orden: number; // 1..n
  tienda: TiendaCandidata;
  items: ItemPlan[];
  subtotal: number;
}

interface PlanCompra {
  etiquetas: TipoPlan[];
  paradas: ParadaPlan[];
  faltantes: Array<{ catalogoId: string; nombre: string; cantidad: number }>;
  subtotal: number;
  distanciaKm: number;
  costoDistancia: number;
  costoTotal: number;
  ahorroVsUnaTienda: number | null;
}

interface FilaComparativa {
  catalogoId: string;
  nombre: string;
  cantidad: number;
  ofertas: Array<{ tiendaId: string; precioUnitario: number; subtotal: number }>; // precio asc
}

interface ResultadoComparacion {
  tiendas: TiendaCandidata[];
  comparativa: FilaComparativa[];
  planes: PlanCompra[];
  sinOfertas: string[]; // catalogoIds sin ninguna oferta en el radio
}

// --- Puras (sin DB) ---
function distanciaHaversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number;
function ordenarRecorrido(origen: { lat: number; lon: number }, paradas: Array<{ id: string; lat: number; lon: number }>): { orden: string[]; distanciaKm: number };

interface ArmarPlanesInput {
  origen: { lat: number; lon: number };
  items: Array<{ catalogoId: string; nombre: string; cantidad: number }>;
  tiendas: TiendaCandidata[];
  ofertas: Oferta[];
  costoKm: number;
  maxTiendas: number;
}
function armarPlanes(input: ArmarPlanesInput): { planes: PlanCompra[]; comparativa: FilaComparativa[]; sinOfertas: string[] };

// --- Con DB ---
interface CompararInput {
  items: Array<{ catalogoId: string; cantidad: number }>;
  lat: number;
  lon: number;
  radioKm?: number;
  soloAbiertas?: boolean;
  maxTiendas?: number;
}
async function compararItems(input: CompararInput, ahora?: Date): Promise<ResultadoComparacion>;
async function compararLista(comprador: Usuario, listaId: string, opciones: Omit<CompararInput, 'items'>): Promise<ResultadoComparacion>;
```

### Casos de error a contemplar

| Código                   | Cuándo                                                       |
| ------------------------- | --------------------------------------------------------------|
| `UBICACION_INVALIDA`      | `lat`/`lon` faltantes o fuera de rango.                      |
| `RADIO_INVALIDO`          | `radioKm` ≤ 0 o > 50.                                        |
| `MAX_TIENDAS_INVALIDO`    | `maxTiendas` no es entero entre 1 y 3.                       |
| `ITEMS_LISTA_INVALIDOS`   | `items` vacío o inválido (`14-listas-compras.md`).           |
| `LISTA_NO_ENCONTRADA`     | `compararLista` sobre una lista inexistente o ajena.         |

## Fases siguientes (planificadas, no implementadas)

Cada fase se implementa cuando exista la infraestructura indicada; hasta entonces el
algoritmo de la fase 1 sigue siendo el vigente.

### Fase 2 — distancia y tiempo reales por calle

- **Qué cambia**: `distanciaKm` en línea recta pasa a distancia/tiempo por la red
  vial (a pie, en auto), y el recorrido se optimiza con la matriz real (TSP chico).
- **Infraestructura**: un motor de ruteo — OSRM o Valhalla autoalojado en Coolify
  con el extracto OSM de Argentina (≈ 2–4 GB RAM), o un servicio externo
  (openrouteservice, Mapbox Directions) con su API key y límites de uso. Caché de
  matrices por celda (Redis o tabla Postgres) para no pedir la misma matriz en cada
  comparación.
- **Contrato**: `PlanCompra` suma `duracionMin` y `modoTraslado`; `distanciaKm` sigue.

### Fase 3 — genérico vs marca

- **Qué cambia**: un ítem de lista puede ser genérico ("gaseosa cola 1,5 L") o de
  marca ("Coca-Cola 1,5 L"). Para un genérico se considera la oferta más barata entre
  todas las marcas equivalentes.
- **Infraestructura**: sólo de datos — tabla `productos_genericos` y
  `productos_catalogo.generico_id`, más curaduría (admin o sugerida por nombre/código
  de barras). `items_lista_compras` gana `generico_id` opcional (ver
  `14-listas-compras.md`).

### Fase 4 — promociones, descuentos y reputación

- **Qué cambia**: el costo del plan incorpora promociones (2x1, % por cantidad,
  descuentos por medio de pago) y el score suma la valoración de la tienda
  (`07-resenas.md`) y si está verificada (`02-tiendas.md`), con pesos configurables
  (`11-admin.md`).
- **Infraestructura**: módulo de promociones (fuera del MVP hoy), sin requisitos de
  infraestructura nuevos. Si el volumen crece, una vista materializada de
  "mejor precio por producto y zona" refrescada periódicamente (requiere un cron).

### Fase 5 — conveniencia

- **Qué cambia**: se ofrece dónde y **cuándo** conviene comprar según los horarios y
  lugares del comprador: una mini encuesta de configuración (horarios de trabajo,
  lugares recurrentes), sus horarios de uso de la app y, con consentimiento explícito,
  el análisis de sus patrones de movimiento por GPS. Así se sugieren tiendas "de
  paso" y franjas horarias disponibles, cruzadas con el horario de apertura de las
  tiendas.
- **Infraestructura**: jobs en segundo plano (cron de Coolify o una cola tipo
  pg-boss sobre el mismo Postgres) para procesar trazas; almacenamiento de
  ubicaciones con retención limitada; consentimiento y política de privacidad (Ley
  25.326 de Protección de Datos Personales); posiblemente PWA con geolocalización en
  segundo plano o app nativa, porque el navegador no rastrea en segundo plano.

### Fase 6 — entrega a domicilio

- **Qué cambia**: un plan puede incluir tiendas con delivery (costo de envío en
  lugar de costo de traslado). La gamificación de visitas para esas compras tendrá su
  propia regla (`12-gamificacion.md`).
- **Infraestructura**: módulo de delivery en tiendas (zonas de reparto, costos),
  sin requisitos técnicos nuevos más allá de los de la fase 2 para estimar tiempos.
