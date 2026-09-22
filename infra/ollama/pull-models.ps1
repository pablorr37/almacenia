# Descarga (si falta) los modelos usados por el orquestador SDD+TDD en el Ollama
# nativo de Windows (no en Docker). Requiere que Ollama este corriendo.

$models = @(
    "deepseek-r1:8b",
    "qwen2.5-coder:7b",
    "nomic-embed-text"
)

foreach ($model in $models) {
    Write-Host "Descargando $model..."
    ollama pull $model
}

Write-Host "Modelos instalados:"
ollama list
