# Hoja de ruta: lista de compras + "Buscar y comparar" (itinerario de compra)

Spec técnica completa: [`specs/sdd/15-itinerario.md`](../specs/sdd/15-itinerario.md)
y [`specs/sdd/14-listas-compras.md`](../specs/sdd/14-listas-compras.md).

**Principio**: esta feature se aplica **paso a paso, según las posibilidades concretas
de infraestructura que tengamos en cada momento**. Cada fase se especifica en detalle
antes de implementarse, sin romper el contrato de la anterior. Hasta que una fase
tenga su infraestructura, el comprador usa la anterior.

| Fase | Qué agrega | Infraestructura que necesita | Estado |
|---|---|---|---|
| 1 | Listas de compras (múltiples, desde el catálogo). Planes por **precio + distancia en línea recta**: "Todo en un lugar", "Precio más bajo", "Mejor equilibrio", con hasta 3 tiendas. Tabla comparativa producto × tienda. Filtro "solo abiertas ahora". | La actual: Postgres + PostGIS (índice GIST), cálculo en el server de Next.js. | **Hecha** |
| 2 | Distancia/tiempo **por calle** (a pie / auto) y recorrido óptimo real. | Motor de ruteo: OSRM/Valhalla autoalojado en Coolify (≈2–4 GB RAM, extracto OSM Argentina) o API externa (openrouteservice/Mapbox) + caché de matrices. | Pendiente |
| 3 | **Genérico vs marca** ("gaseosa" vs "Coca-Cola 1,5 L"). | Solo datos: tabla `productos_genericos`, `generico_id` en catálogo e ítems de lista, curaduría admin. | Pendiente |
| 4 | **Promociones y descuentos**, valoración de la tienda, tienda verificada, pesos configurables. | Módulo de promociones; opcional vista materializada + cron. | Pendiente |
| 5 | **Conveniencia**: encuesta (horarios de trabajo, lugares recurrentes), horarios de uso de la app, patrones de movimiento GPS → dónde y cuándo conviene comprar. | Jobs en background (cron Coolify / pg-boss), almacenamiento de ubicaciones con retención, consentimiento y política de privacidad (Ley 25.326), PWA/app nativa para GPS en segundo plano. | Pendiente |
| 6 | **Entrega a domicilio** dentro de los planes (costo de envío en vez de traslado). | Módulo de delivery en tiendas (zonas, costos). | Pendiente |

## Evaluación de infraestructura para la fase 1

- **PostGIS alcanza**: la búsqueda de tiendas en radio ya existe
  (`buscarTiendasCercanas`, `ST_DWithin`). Se restauró el índice GIST
  `tiendas_ubicacion_gist_idx`, que una migración anterior había borrado sin
  recrearlo.
- **Consulta de ofertas**: una sola query por comparación, con índice
  `productos (catalogo_id, disponible)`.
- **Cálculo**: enumeración exacta de hasta 575 combinaciones de ≤3 tiendas entre las
  15 mejores candidatas — milisegundos en el mismo request, sin colas ni caché.
- **Límite conocido**: distancia en línea recta (subestima el trayecto real) y sin
  tiempo de traslado → lo resuelve la fase 2.
- **Parámetro de negocio**: `itinerario.costo_km` (ARS por km, default 300) convierte
  la distancia en plata para compararla con el ahorro; editable en el panel admin.
