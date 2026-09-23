# Almacenia

Gestión de almacenes, kioscos y verdulerías. Dos features: **vendedor** (tienda,
catálogo, pedidos, gestión interna) y **comprador** (mapa, pedidos, itinerario de
compra). Stack: Next.js (TypeScript, app router), PostgreSQL + PostGIS, Prisma,
Leaflet/MapLibre. Deploy en Coolify.

## Fuente de verdad: `specs/sdd/`

`specs/sdd/00-overview.md` a `05-ventas.md` son la spec técnica completa del MVP:
modelo de datos, reglas de negocio, endpoints REST y firmas TypeScript, módulo por
módulo. **Toda implementación debe alinearse con esos documentos, no improvisar el
modelo de datos ni las convenciones ahí definidas** (formato de respuesta de API,
autenticación, paginación — ver `00-overview.md`). Si una spec queda ambigua o
incompleta para lo que se necesita implementar, se actualiza la spec primero, no se
decide silenciosamente algo distinto en el código.

## Disciplina de trabajo: SDD + TDD, un módulo/función por vez

Para cada función o endpoint a implementar:

1. Leer la sección relevante de `specs/sdd/<modulo>.md`.
2. Escribir el test (Vitest) a partir de esa spec, **antes** que la implementación —
   confirmar que falla (rojo) por el motivo correcto (la función no existe/no hace lo
   esperado), no por un error de sintaxis o de setup.
3. Implementar lo mínimo necesario para que el test pase.
4. Correr `npm test` y confirmar verde antes de dar la función por terminada.
5. Si la función accede a DB, usar Prisma (`prisma/schema.prisma`) — no inventar otro
   patrón de acceso a datos.

## Ubicación del código

- `src/lib/<modulo>/` — lógica de negocio y acceso a datos (funciones casi-puras, sin
  depender de Next.js request/response). Ej. `src/lib/tiendas/tiendas.ts`.
- `src/lib/<modulo>/<modulo>.test.ts` — tests del módulo (Vitest), junto al código que
  testean.
- `src/app/api/<modulo>/` — API routes que llaman a `src/lib/<modulo>/`, parsean el
  request, chequean auth y mapean errores al formato de respuesta de `00-overview.md`.

**No** usar el patrón `src/generated/<modulo>.ts` (archivo plano por tarea) — es un
artefacto del pipeline local pausado (ver abajo), no la convención del proyecto.

## `agents/` — pipeline local pausado, no tocar

`agents/` (orquestador Python + Ollama + Qdrant) y `infra/` (Docker de esa infra +
bot de Telegram) son un experimento de desarrollo agéntico local que quedó
**pausado** — ninguna de sus tareas de prueba llegó a completarse (ver
`agents/memory/decisiones/claude-code-primario.md`). No se ejecuta ni se modifica
salvo que el usuario lo pida explícitamente. Claude Code es el camino primario de
desarrollo del proyecto.

## Flujo de trabajo con git

Se desarrolla y commitea en este repo local. El dev revisa el código y lo testea en
local; recién ahí se hace push a GitHub, lo que dispara el autodeploy en Coolify. No
hacer push salvo pedido explícito.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
