---
name: telegram-bot
description: Bot de Telegram para operar el orquestador a distancia
metadata:
  type: project
---

`agents/telegram_bot.py` envuelve a `orchestrator.py` como subproceso (no lo modifica
ni le agrega dependencias) para poder consultar `tasks.json`, cargar tareas y disparar
corridas desde Telegram, con notificación automática al terminar. Corre como proceso
Python separado con polling (no Docker), autorizado solo para el `chat_id` guardado en
`agents/.env` (`TELEGRAM_CHAT_ID`). Ver `infra/telegram/README.md` para el setup.

**Por qué:** operar el orquestador (cargar tareas, disparar corridas, leer resultados)
requería estar frente a la PC. El usuario quería hacerlo a distancia.

**Cómo aplicar:** las notificaciones automáticas solo cubren corridas disparadas con
`/run` desde el bot, no corridas manuales por terminal (ver limitación documentada en
`infra/telegram/README.md`). Si se agregan comandos nuevos al bot, mantenerlo como
envoltorio de `orchestrator.py` — no acoplar lógica de negocio del orquestador al
código de Telegram.
