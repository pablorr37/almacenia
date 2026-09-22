# Descarga los modelos usados por el orquestador SDD+TDD dentro del contenedor Ollama.
# Ejecutar despues de `docker compose -f infra/docker-compose.yml up -d`.

$models = @(
    "deepseek-r1:8b",
    "qwen2.5-coder:7b",
    "nomic-embed-text"
)

foreach ($model in $models) {
    Write-Host "Descargando $model..."
    docker exec almacenia_ollama ollama pull $model
}

Write-Host "Modelos instalados:"
docker exec almacenia_ollama ollama list
