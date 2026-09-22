---
name: flujo-agentes
description: Ciclo Spec-Test-Code-Verificación del orquestador SDD+TDD
metadata:
  type: project
---

El orquestador (`agents/orchestrator.py`) procesa cada tarea de `agents/tasks/tasks.json`
en 4 fases: arquitecto (spec) → test_writer (tests Vitest) → developer (código) →
verifier (corre los tests). Si fallan los tests, developer reintenta hasta 3 veces
pasándole el output del fallo anterior; si sigue fallando la tarea queda `bloqueada`
para revisión humana.

**Por qué:** el prototipo anterior en `C:\agentes_dev` no tenía fase de tests ni loop
de verificación (solo Spec→Código), lo que no daba garantías de que el código generado
funcionara. Se prioriza rigor y trabajo sostenido por sobre velocidad.

**Cómo aplicar:** cualquier tarea nueva se agrega a `tasks.json` con status `pendiente`;
no se edita código generado a mano dentro de `src/generated/` sin también actualizar
la spec correspondiente en `specs/`, para no perder la trazabilidad spec→código.
