# Infra local — Postgres + Qdrant + Ollama

## Postgres (activo — base de datos de la app)

Servicio `postgres` (imagen `postgis/postgis`, incluye la extensión PostGIS que usa
`Tienda.ubicacion` en `prisma/schema.prisma`). Levantar:

```
docker compose -f infra/docker-compose.yml up -d postgres
```

Credenciales de desarrollo (`DATABASE_URL` en `.env`, ver `.env.example`):
usuario/contraseña/db `almacenia`/`almacenia`/`almacenia`, puerto `5432`.

Migraciones con Prisma:

```
npx prisma migrate dev
npx prisma generate
```

## Qdrant + Ollama (pausado — pipeline local de agentes)

El resto de esta infra (Qdrant + Ollama nativo + `agents/orchestrator.py`) era para
un pipeline de desarrollo agéntico local que quedó **pausado** — ver
`agents/memory/decisiones/claude-code-primario.md`. Se documenta acá por si se
retoma, no es necesaria para el desarrollo activo (que usa Claude Code + Postgres).

Qdrant corre en Docker (memoria RAG). Ollama corre **nativo en Windows** (no en Docker),
reusando la instalación y los modelos ya existentes en el host, con acceso directo a la
GPU sin capas de virtualización extra. Ambos exponen sus puertos habituales en
`localhost`, así que `agents/` los usa igual sin importar cómo corren.

```
docker compose -f infra/docker-compose.yml up -d qdrant
```

Ollama nativo debe estar corriendo (la app de Ollama en Windows, o `ollama serve`).
Confirmar que tiene los modelos necesarios:

```
ollama list
```

Si falta alguno:

```
ollama pull deepseek-r1:8b
ollama pull qwen2.5-coder:7b
ollama pull nomic-embed-text
```

Verificar:
- Qdrant: http://localhost:6333/collections
- Ollama: http://localhost:11434/api/tags

## Apagar todo

```
docker compose -f infra/docker-compose.yml down
```

## Resetear (borra datos de Postgres y memoria RAG de Qdrant)

```
docker compose -f infra/docker-compose.yml down -v
```

## Modelos (Ollama nativo, pipeline pausado)

- `deepseek-r1:8b` — agente arquitecto (specs)
- `qwen2.5-coder:7b` — agente desarrollador (código)
- `nomic-embed-text` — embeddings para memoria RAG en Qdrant

## GPU

La GPU NVIDIA la usa Ollama nativo directamente (sin Docker), que es más simple y
eficiente en Windows que pasar la GPU a un contenedor. Ni Postgres ni Qdrant
necesitan GPU.
