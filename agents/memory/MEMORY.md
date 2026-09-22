# Memoria del sistema de agentes — Almacenia

Índice de decisiones y convenciones que los agentes (y el desarrollador) deben conocer entre sesiones.

## SDD del proyecto

- [`specs/sdd/00-overview.md`](../../specs/sdd/00-overview.md) — fuente de verdad del
  modelo de datos, endpoints y convenciones del MVP (auth, tiendas, productos,
  pedidos, ventas). Toda tarea nueva que toque uno de estos módulos debe alinearse
  con su spec en `specs/sdd/`, no reinventar el modelo de datos.

## Decisiones de arquitectura

- [Stack de la app](decisiones/stack-app.md) — Next.js + TypeScript + PostgreSQL/PostGIS.
- [Flujo de agentes](decisiones/flujo-agentes.md) — Spec → Test → Code → Verificación, máx. 3 reintentos.
- [Ollama nativo, no Docker](decisiones/ollama-nativo.md) — la infra local usa Ollama de Windows, solo Qdrant va en Docker.

## Convenciones de código

_(se completa a medida que el equipo/los agentes toman decisiones no obvias desde los tests)_

## Notas

Esta memoria es del sistema de agentes (infra), no reemplaza el memory.md de Claude Code del usuario.
