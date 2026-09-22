# Infra local — Qdrant + Ollama

Infraestructura para los agentes IA (SDD+TDD) que desarrollan Almacenia. Corre 100% local (i9 / 32GB RAM / RTX 6GB).

## Levantar

```
docker compose -f infra/docker-compose.yml up -d
powershell -File infra/ollama/pull-models.ps1
```

Verificar:
- Qdrant: http://localhost:6333/collections
- Ollama: http://localhost:11434/api/tags

## Apagar

```
docker compose -f infra/docker-compose.yml down
```

## Resetear (borra memoria RAG y modelos descargados)

```
docker compose -f infra/docker-compose.yml down -v
```

## Modelos

- `deepseek-r1:8b` — agente arquitecto (specs)
- `qwen2.5-coder:7b` — agente desarrollador (código)
- `nomic-embed-text` — embeddings para memoria RAG en Qdrant

## GPU

`docker-compose.yml` reserva la GPU NVIDIA para el servicio `ollama`. Requiere Docker Desktop con backend WSL2 y NVIDIA Container Toolkit configurado. Si no hay GPU disponible, Ollama corre en CPU (más lento pero funcional).
