---
name: orm-prisma
description: Prisma como capa de persistencia para las funciones con DB del SDD
metadata:
  type: project
---

Las funciones `async` de `specs/sdd/*.md` que acceden a la base de datos usan Prisma
como ORM (schema en `prisma/schema.prisma`, cliente generado `@prisma/client`).

**Por qué:** sin fijar esto, cada tarea del orquestador que toque una función con DB
inventaría su propio patrón de acceso a datos (Prisma, SQL crudo, otro ORM) de forma
inconsistente entre sí. Prisma es lo más común en proyectos Next.js/TypeScript, así que
los modelos locales (`qwen2.5-coder:7b`) tienen mejor tasa de acierto generándolo que
con alternativas menos representadas en su entrenamiento.

**Cómo aplicar:** antes de cargar en `agents/tasks/tasks.json` cualquier tarea que
implemente una función `async` de `specs/sdd/*.md` con acceso a DB, hay que tener
commiteado `prisma/schema.prisma` (derivado 1:1 de los modelos de datos SQL en cada
spec de módulo) y pasarlo como contexto de la tarea — si no, no se carga esa tarea
todavía. Mientras tanto, se priorizan tareas de lógica pura (sin DB) del SDD, que el
pipeline ya probó que maneja bien (ver `flujo-agentes.md`).
