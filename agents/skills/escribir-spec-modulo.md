# Skill: escribir spec de módulo

Guía que sigue el agente arquitecto (`agents/roles/architect.py`) al redactar la spec
de un módulo nuevo de Almacenia.

1. Leer el objetivo de la tarea y buscar en la memoria RAG (`almacenia_specs`) specs
   previas relacionadas, para mantener consistencia de nombres y contratos entre módulos.
2. Ubicar el módulo dentro del dominio: `tiendas`, `productos`, `pedidos`,
   `gestion-interna` o `comprador` (ver [[stack-app]]).
3. Redactar la spec en markdown con las secciones: Requisitos funcionales, Firmas de
   funciones/clases (TypeScript), Casos de error a contemplar, Casos de prueba esperados.
4. No incluir código de implementación — eso es responsabilidad del agente desarrollador.
5. Indexar la spec resultante en Qdrant para que quede disponible como contexto de
   futuras tareas relacionadas.
