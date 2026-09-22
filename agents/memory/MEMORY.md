# Memoria del sistema de agentes — Almacenia

Índice de decisiones y convenciones que los agentes (y el desarrollador) deben conocer entre sesiones.

## SDD del proyecto

- [`specs/sdd/00-overview.md`](../../specs/sdd/00-overview.md) — fuente de verdad del
  modelo de datos, endpoints y convenciones del MVP (auth, tiendas, productos,
  pedidos, ventas). Toda tarea nueva que toque uno de estos módulos debe alinearse
  con su spec en `specs/sdd/`, no reinventar el modelo de datos.
- Cada tarea de `agents/tasks/tasks.json` que documenta un módulo del SDD trae un
  campo `"sdd": "<archivo>.md"` — `orchestrator.py` lo lee directo de `specs/sdd/` y
  se lo pasa al agente arquitecto como contexto explícito. **No** se usa búsqueda
  semántica (RAG) para esto (ver [Flujo de agentes](decisiones/flujo-agentes.md) para
  la causa raíz del bug que llevó a este cambio). `agents/index_sdd.py` quedó sin uso
  activo en el pipeline — no volver a depender de él para dar contexto del SDD.

## Decisiones de arquitectura

- [Stack de la app](decisiones/stack-app.md) — Next.js + TypeScript + PostgreSQL/PostGIS.
- [Flujo de agentes](decisiones/flujo-agentes.md) — Spec → Test → Code → Verificación, máx. 3 reintentos.
- [Ollama nativo, no Docker](decisiones/ollama-nativo.md) — la infra local usa Ollama de Windows, solo Qdrant va en Docker.
- [ORM: Prisma](decisiones/orm-prisma.md) — las tareas con acceso a DB del SDD esperan Prisma; no se cargan a `tasks.json` hasta tener `prisma/schema.prisma` commiteado. Mientras tanto se priorizan tareas de lógica pura.
- [Bot de Telegram](decisiones/telegram-bot.md) — `agents/telegram_bot.py` opera el orquestador a distancia (setup en `infra/telegram/README.md`).

## Convenciones de código

_(se completa a medida que el equipo/los agentes toman decisiones no obvias desde los tests)_

## Notas

Esta memoria es del sistema de agentes (infra), no reemplaza el memory.md de Claude Code del usuario.
