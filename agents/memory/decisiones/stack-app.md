---
name: stack-app
description: Stack técnico elegido para Almacenia
metadata:
  type: project
---

Almacenia usa Next.js (TypeScript, app router) como frontend+backend, PostgreSQL con
PostGIS para geolocalización de tiendas y cálculo de distancias/itinerarios, y
Leaflet/MapLibre GL para el mapa. Auth con roles `vendedor`/`comprador`.

**Por qué:** un solo lenguaje (TS) simplifica que los agentes generen y testeen código
de punta a punta; PostGIS es el estándar para queries geoespaciales; deploy objetivo
es Coolify (4vCPU/8GB RAM), stack liviano y sin dependencias de servicios cloud pagos.

**Cómo aplicar:** toda spec nueva de un módulo de la app debe asumir este stack salvo
decisión explícita en contrario documentada acá.
