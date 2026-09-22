# Memoria del sistema de agentes — Almacenia

Índice de decisiones y convenciones que los agentes (y el desarrollador) deben conocer entre sesiones.

## SDD del proyecto

- [`specs/sdd/00-overview.md`](../../specs/sdd/00-overview.md) — fuente de verdad del
  modelo de datos, endpoints y convenciones del MVP (auth, tiendas, productos,
  pedidos, ventas). Toda tarea nueva que toque uno de estos módulos debe alinearse
  con su spec en `specs/sdd/`, no reinventar el modelo de datos.
- Los 6 archivos de `specs/sdd/` están indexados en la colección Qdrant
  `almacenia_specs` (`python agents/index_sdd.py`) — el agente arquitecto los recibe
  como contexto RAG al escribir la spec de una tarea nueva. Si se edita un archivo de
  `specs/sdd/`, volver a correr `index_sdd.py` para no dejar el contexto desactualizado.

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
