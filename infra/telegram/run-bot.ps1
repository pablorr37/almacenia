# Arranca el bot de Telegram del orquestador. Requiere agents/.env con
# TELEGRAM_BOT_TOKEN (ver infra/telegram/README.md) y el venv de agents/ instalado
# (pip install -r agents/requirements.txt).

$agentsDir = Join-Path $PSScriptRoot "..\..\agents"
$python = Join-Path $agentsDir "venv\Scripts\python.exe"

& $python (Join-Path $agentsDir "telegram_bot.py")
