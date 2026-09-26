# Almacenia

Gestión de almacenes, kioscos y verdulerías. Dos features principales:

- **Vendedor**: registro de tienda por geolocalización, catálogo de productos/precios/
  promociones, gestión interna (ventas, bajas, pedidos, balance), recepción de pedidos
  para retiro en el local.
- **Comprador**: mapa de tiendas cercanas con precios y promociones, pedidos y contacto
  con el vendedor, listas de compras y "Buscar y comparar": planes de compra entre
  tiendas cercanas por precio + distancia (se completa por fases según la
  infraestructura disponible — ver [`docs/roadmap-itinerario.md`](docs/roadmap-itinerario.md)).
- **Gamificación**: puntos para vendedores y compradores (`specs/sdd/12-gamificacion.md`).

La spec técnica completa está en [`specs/sdd/`](specs/sdd/00-overview.md).

## Stack

Next.js (TypeScript) + PostgreSQL/PostGIS + Leaflet/MapLibre. Deploy en Coolify.

## Desarrollo con agentes IA (SDD+TDD)

Este proyecto se desarrolla con agentes IA locales (Ollama + Qdrant) que siguen un
ciclo Spec → Test → Code → Verificación. Ver [`infra/README.md`](infra/README.md) para
levantar la infraestructura y [`agents/`](agents/) para el orquestador y su memoria.

## Flujo de trabajo

1. Se desarrolla y commitea en este repo local.
2. El dev revisa el código generado y lo testea en local.
3. Recién ahí se hace push a GitHub, lo que dispara el autodeploy en Coolify.
