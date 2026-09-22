# Bot de Telegram del orquestador

Permite controlar y monitorear `agents/orchestrator.py` a distancia: ver el estado de
`tasks.json`, cargar tareas nuevas, disparar una corrida y recibir sola la
notificación cuando termina.

## Setup

1. Crear el bot con [@BotFather](https://t.me/BotFather) (`/newbot`) y copiar el
   token.
2. Copiar `agents/.env.example` a `agents/.env` y completar `TELEGRAM_BOT_TOKEN`.
3. Instalar dependencias si falta: `agents/venv/Scripts/pip install -r agents/requirements.txt`.
4. Arrancar el bot: `powershell -File infra/telegram/run-bot.ps1`.
5. Mandarle `/start` al bot desde Telegram — como `TELEGRAM_CHAT_ID` todavía está
   vacío, responde con tu `chat_id`.
6. Copiar ese `chat_id` a `TELEGRAM_CHAT_ID` en `agents/.env`, reiniciar el bot
   (`Ctrl+C` y volver a correr `run-bot.ps1`). A partir de ahí solo ese `chat_id`
   recibe respuesta — cualquier otro mensaje se ignora en silencio.

## Comandos

- `/status` — resumen de tareas por estado + detalle de las últimas 5.
- `/tarea <id>` — detalle de una tarea puntual (objetivo completo + inicio de su spec, si ya se generó).
- `/nueva <modulo> | <objetivo>` — agrega una tarea `pendiente` a `tasks.json`.
- `/run` — dispara `orchestrator.py` en background. Si ya hay una corrida en curso, avisa en vez de lanzar una segunda en paralelo. Al terminar, notifica solo qué tareas cambiaron de estado.
- `/log` — últimas ~50 líneas del output de la corrida más reciente disparada por `/run`.

## Limitación conocida

Las notificaciones automáticas de `/run` solo cubren corridas disparadas **desde el
bot**. Si corrés `orchestrator.py` a mano por terminal (como en el resto de esta
sesión), el bot no se entera — `tasks.json` va a reflejar el cambio igual, pero no
llega el push. Para tener siempre notificación, disparar la corrida con `/run`.

## Mantener corriendo

El bot corre como proceso Python normal (polling), sin contenedor Docker. Se apaga si
cerrás la terminal o apagás la PC — igual que Ollama. Para dejarlo corriendo de forma
más permanente, se puede crear una tarea programada de Windows que ejecute
`run-bot.ps1` al iniciar sesión (no incluido acá, es configuración local del usuario).
