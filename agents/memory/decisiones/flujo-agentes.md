---
name: flujo-agentes
description: Ciclo Spec-Test-Code-Verificación del orquestador SDD+TDD
metadata:
  type: project
---

> **Pipeline pausado (ver [[claude-code-primario]]).** Este documento describe el
> pipeline local (Ollama + Qdrant), que quedó pausado tras confirmarse que ninguna de
> las 6 tareas cargadas logró completarse. Se conserva como referencia histórica, no
> se borra ni se reescribe. Claude Code es ahora el camino primario de desarrollo.

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

**Referencia al SDD — campo `sdd` (no RAG genérico):** cada tarea que documenta una
función/feature de un módulo del SDD debe traer `"sdd": "<archivo>.md"` (el archivo de
`specs/sdd/` correspondiente). `orchestrator.py` lo lee directo de disco y se lo pasa a
`architect.write_spec` como contexto separado y explícito. **No** se usa búsqueda
semántica (`rag.search`) para traer el SDD — se probó (tarea `productos-es-comprable`,
bloqueada la primera vez) que con documentos largos y de vocabulario superpuesto entre
módulos (ej. "stock"/"disponible" aparecen tanto en `03-productos.md` como en
`04-pedidos.md`), el modelo local de 8B puede recuperar el documento equivocado y
copiarlo entero en vez de escribir la spec puntual pedida. El `rag.search` sobre
`almacenia_specs` queda restringido a `tipo == "spec"` (specs de tareas previas ya
resueltas, no los documentos completos del SDD), justamente para evitar esa mezcla.
