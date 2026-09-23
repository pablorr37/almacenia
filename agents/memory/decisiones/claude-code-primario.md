---
name: claude-code-primario
description: Claude Code pasa a ser el implementador SDD+TDD primario del proyecto
metadata:
  type: project
---

Claude Code (esta herramienta) es ahora el camino primario de desarrollo de
Almacenia. Para cada función/endpoint del SDD, Claude Code juega en un solo hilo de
conversación los roles que antes cubría el pipeline local por separado: escribe el
test (en rojo) derivado de la spec de `specs/sdd/`, implementa lo mínimo para pasarlo,
corre `npm test` y confirma verde. Ver `CLAUDE.md` en la raíz del repo para la
disciplina completa.

**Por qué:** se auditó el estado del pipeline local (`agents/orchestrator.py` +
Ollama 8B + Qdrant) y las 6 tareas cargadas en `agents/tasks/tasks.json` — todas
funciones puras, el escenario más fácil posible — terminaron las 6 `bloqueada` tras 3
reintentos cada una (ver [[flujo-agentes]] para los bugs de infra ya corregidos en el
camino: contaminación de contexto RAG, `cwd` del verifier). El cuello de botella de
fondo es la capacidad del modelo local de 7-8B para sostener spec→test→code→verde de
forma consistente, no la arquitectura del pipeline.

**Cómo aplicar:** el pipeline local (`agents/`, `infra/docker-compose.yml`, el bot de
Telegram) queda **pausado, no borrado** — documentado como inactivo, disponible si en
el futuro se retoma para trabajo masivo/repetitivo de bajo riesgo. No se reprocesan
ni se borran las 6 tareas bloqueadas de `tasks.json`, quedan como registro del
experimento. El motivo original para restringir esas tareas a lógica pura (evitar que
el modelo local inventara su propio patrón de acceso a datos) ya no aplica con Claude
Code — el trabajo nuevo arranca directo por los módulos reales del SDD con Prisma
(ver [[orm-prisma]]), no por lógica pura aislada.
