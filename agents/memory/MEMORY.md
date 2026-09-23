# Memoria del sistema de agentes — Almacenia

Índice de decisiones y convenciones que los agentes (y el desarrollador) deben conocer entre sesiones.

> **Pipeline local pausado.** Claude Code es ahora el implementador SDD+TDD primario
> del proyecto — ver [Claude Code primario](decisiones/claude-code-primario.md) y
> `CLAUDE.md` en la raíz del repo. Todo lo de acá abajo sobre `agents/orchestrator.py`
> describe ese pipeline pausado (no borrado), no el flujo activo.

## SDD del proyecto

- [`specs/sdd/00-overview.md`](../../specs/sdd/00-overview.md) — fuente de verdad del
  modelo de datos, endpoints y convenciones del MVP (auth, tiendas, productos,
  pedidos, ventas). Toda implementación nueva que toque uno de estos módulos debe
  alinearse con su spec en `specs/sdd/`, no reinventar el modelo de datos.
- Cada tarea de `agents/tasks/tasks.json` que documenta un módulo del SDD trae un
  campo `"sdd": "<archivo>.md"` — `orchestrator.py` lo lee directo de `specs/sdd/` y
  se lo pasa al agente arquitecto como contexto explícito. **No** se usa búsqueda
  semántica (RAG) para esto (ver [Flujo de agentes](decisiones/flujo-agentes.md) para
  la causa raíz del bug que llevó a este cambio). `agents/index_sdd.py` quedó sin uso
  activo en el pipeline — no volver a depender de él para dar contexto del SDD.

## Decisiones de arquitectura

- [Claude Code primario](decisiones/claude-code-primario.md) — Claude Code reemplaza al pipeline local como implementador SDD+TDD, en un solo hilo por tarea (no subagentes por rol).
- [Stack de la app](decisiones/stack-app.md) — Next.js + TypeScript + PostgreSQL/PostGIS.
- [Flujo de agentes](decisiones/flujo-agentes.md) — pipeline local **pausado**: Spec → Test → Code → Verificación, máx. 3 reintentos, ninguna tarea completada.
- [Ollama nativo, no Docker](decisiones/ollama-nativo.md) — la infra local usa Ollama de Windows, solo Qdrant va en Docker.
- [ORM: Prisma](decisiones/orm-prisma.md) — capa de persistencia para las funciones con DB del SDD, ahora implementadas por Claude Code.
- [Bot de Telegram](decisiones/telegram-bot.md) — `agents/telegram_bot.py` opera el pipeline local pausado a distancia (setup en `infra/telegram/README.md`).

## Convenciones de código

_(se completa a medida que el equipo/los agentes toman decisiones no obvias desde los tests)_

## Notas

Esta memoria es del sistema de agentes (infra local pausada), no reemplaza el
memory.md de Claude Code del usuario. Para la disciplina de trabajo activa, ver
`CLAUDE.md` en la raíz del repo.
