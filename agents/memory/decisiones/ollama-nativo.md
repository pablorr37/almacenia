---
name: ollama-nativo
description: Ollama corre nativo en Windows, no dentro de Docker
metadata:
  type: project
---

La infra local (`infra/docker-compose.yml`) solo levanta Qdrant en Docker. Ollama corre
nativo en Windows (la app de Ollama ya instalada, con los modelos `deepseek-r1:8b`,
`qwen2.5-coder:7b` y `nomic-embed-text` ya descargados), y `agents/` le pega por HTTP a
`localhost:11434` igual que si estuviera en un contenedor.

**Por qué:** el usuario ya tenía Ollama nativo corriendo con esos modelos (~13GB).
Levantarlo también en Docker duplicaba la descarga y agregaba una capa de
virtualización innecesaria para acceder a la GPU en Windows.

**Cómo aplicar:** no volver a agregar un servicio `ollama` al `docker-compose.yml` de
`infra/` salvo que el usuario decida moverse a otra máquina sin Ollama nativo instalado.
