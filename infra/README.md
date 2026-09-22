# Infra local — Qdrant + Ollama

Infraestructura para los agentes IA (SDD+TDD) que desarrollan Almacenia. Corre 100% local (i9 / 32GB RAM / RTX 6GB).

Qdrant corre en Docker (memoria RAG). Ollama corre **nativo en Windows** (no en Docker),
reusando la instalación y los modelos ya existentes en el host, con acceso directo a la
GPU sin capas de virtualización extra. Ambos exponen sus puertos habituales en
`localhost`, así que `agents/` los usa igual sin importar cómo corren.

## Levantar

```
docker compose -f infra/docker-compose.yml up -d
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

## Apagar

```
docker compose -f infra/docker-compose.yml down
```

## Resetear (borra memoria RAG)

```
docker compose -f infra/docker-compose.yml down -v
```

## Modelos (Ollama nativo)

- `deepseek-r1:8b` — agente arquitecto (specs)
- `qwen2.5-coder:7b` — agente desarrollador (código)
- `nomic-embed-text` — embeddings para memoria RAG en Qdrant

## GPU

La GPU NVIDIA la usa Ollama nativo directamente (sin Docker), que es más simple y
eficiente en Windows que pasar la GPU a un contenedor. Qdrant no necesita GPU.
