"""Bot de Telegram para controlar/monitorear el orquestador SDD+TDD a distancia.

Uso: python agents/telegram_bot.py
Requiere agents/.env con TELEGRAM_BOT_TOKEN (y TELEGRAM_CHAT_ID una vez conocido,
ver README de infra/telegram/). No modifica orchestrator.py: lo invoca como
subproceso, igual que se corre a mano desde la terminal.
"""
from __future__ import annotations

import asyncio
import json
import os
import subprocess
import sys
from pathlib import Path

from dotenv import load_dotenv
from telegram import Update
from telegram.ext import Application, CommandHandler, ContextTypes

AGENTS_DIR = Path(__file__).parent
TASKS_FILE = AGENTS_DIR / "tasks" / "tasks.json"
SPECS_DIR = AGENTS_DIR.parent / "specs"
LOGS_DIR = AGENTS_DIR / "logs"
LOG_FILE = LOGS_DIR / "orchestrator.log"
LOCK_FILE = AGENTS_DIR / "tasks" / ".orchestrator.lock"
PYTHON_EXE = AGENTS_DIR / "venv" / "Scripts" / "python.exe"
ORCHESTRATOR_SCRIPT = AGENTS_DIR / "orchestrator.py"

load_dotenv(AGENTS_DIR / ".env")

BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN")
CHAT_ID = os.environ.get("TELEGRAM_CHAT_ID")  # puede estar vacío al principio


def _autorizado(update: Update) -> bool:
    """Con CHAT_ID vacío, cualquiera puede hablarle al bot (fase de handshake de
    /start). Con CHAT_ID seteado, todo lo demás se ignora en silencio."""
    if not CHAT_ID:
        return True
    return str(update.effective_chat.id) == str(CHAT_ID)


def _cargar_tareas() -> dict:
    with open(TASKS_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def _guardar_tareas(data: dict) -> None:
    with open(TASKS_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    chat_id = update.effective_chat.id
    if not CHAT_ID:
        await update.message.reply_text(
            f"Tu chat_id es {chat_id}. Copialo a TELEGRAM_CHAT_ID en agents/.env "
            "y reiniciá el bot para que solo vos puedas usarlo."
        )
        return
    if not _autorizado(update):
        return
    await update.message.reply_text("Bot del orquestador de Almacenia. /status /tarea /run /nueva /log")


async def status(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _autorizado(update):
        return
    data = _cargar_tareas()
    tareas = data["tareas"]
    por_estado: dict[str, int] = {}
    for t in tareas:
        por_estado[t["status"]] = por_estado.get(t["status"], 0) + 1
    resumen = ", ".join(f"{k}: {v}" for k, v in por_estado.items()) or "sin tareas"

    ultimas = tareas[-5:]
    detalle = "\n".join(
        f"#{t['id']} {t['modulo']} — {t['status']} (intentos: {t['intentos']})"
        for t in ultimas
    )
    await update.message.reply_text(f"Estado: {resumen}\n\nÚltimas tareas:\n{detalle}")


async def tarea(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _autorizado(update):
        return
    if not context.args:
        await update.message.reply_text("Uso: /tarea <id>")
        return
    try:
        tarea_id = int(context.args[0])
    except ValueError:
        await update.message.reply_text("El id tiene que ser un número.")
        return

    data = _cargar_tareas()
    encontrada = next((t for t in data["tareas"] if t["id"] == tarea_id), None)
    if not encontrada:
        await update.message.reply_text(f"No existe la tarea #{tarea_id}.")
        return

    texto = (
        f"#{encontrada['id']} {encontrada['modulo']}\n"
        f"Estado: {encontrada['status']} (intentos: {encontrada['intentos']})\n"
        f"Objetivo: {encontrada['objetivo']}"
    )

    spec_path = SPECS_DIR / f"{encontrada['modulo']}_spec.md"
    if spec_path.exists():
        primeras_lineas = "\n".join(spec_path.read_text(encoding="utf-8").splitlines()[:15])
        texto += f"\n\n--- spec (primeras líneas) ---\n{primeras_lineas}"

    await update.message.reply_text(texto)


async def nueva(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _autorizado(update):
        return
    texto = " ".join(context.args)
    if "|" not in texto:
        await update.message.reply_text("Uso: /nueva <modulo> | <objetivo>")
        return

    modulo, objetivo = (p.strip() for p in texto.split("|", 1))
    if not modulo or not objetivo:
        await update.message.reply_text("Uso: /nueva <modulo> | <objetivo>")
        return

    data = _cargar_tareas()
    siguiente_id = max((t["id"] for t in data["tareas"]), default=0) + 1
    data["tareas"].append(
        {"id": siguiente_id, "modulo": modulo, "objetivo": objetivo, "status": "pendiente", "intentos": 0}
    )
    _guardar_tareas(data)
    await update.message.reply_text(f"Tarea #{siguiente_id} ({modulo}) agregada como pendiente.")


async def log(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _autorizado(update):
        return
    if not LOG_FILE.exists():
        await update.message.reply_text("Todavía no hay ninguna corrida registrada.")
        return
    lineas = LOG_FILE.read_text(encoding="utf-8", errors="replace").splitlines()[-50:]
    texto = "\n".join(lineas) or "(log vacío)"
    # Telegram corta mensajes largos; nos quedamos con el final si excede el límite.
    await update.message.reply_text(texto[-3500:])


async def run(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _autorizado(update):
        return
    if LOCK_FILE.exists():
        await update.message.reply_text("Ya hay una corrida en curso, esperá a que termine.")
        return

    await update.message.reply_text("Arrancando el orquestador...")
    LOCK_FILE.write_text("", encoding="utf-8")
    estado_antes = {t["id"]: t["status"] for t in _cargar_tareas()["tareas"]}

    asyncio.create_task(_correr_orquestador(update, context, estado_antes))


async def _correr_orquestador(update: Update, context: ContextTypes.DEFAULT_TYPE, estado_antes: dict) -> None:
    LOGS_DIR.mkdir(exist_ok=True)
    try:
        with open(LOG_FILE, "w", encoding="utf-8") as log_f:
            proceso = await asyncio.create_subprocess_exec(
                str(PYTHON_EXE),
                str(ORCHESTRATOR_SCRIPT),
                cwd=str(AGENTS_DIR),
                stdout=log_f,
                stderr=asyncio.subprocess.STDOUT,
            )
            await proceso.wait()

        estado_despues = {t["id"]: (t["modulo"], t["status"]) for t in _cargar_tareas()["tareas"]}
        cambios = [
            f"#{tid} {modulo}: {estado_antes.get(tid, '(nueva)')} -> {estado}"
            for tid, (modulo, estado) in estado_despues.items()
            if estado_antes.get(tid) != estado
        ]
        resumen = "\n".join(cambios) if cambios else "Sin cambios de estado."
        await context.bot.send_message(chat_id=update.effective_chat.id, text=f"Corrida terminada.\n{resumen}")
    finally:
        LOCK_FILE.unlink(missing_ok=True)


def main() -> None:
    if not BOT_TOKEN:
        print("Falta TELEGRAM_BOT_TOKEN en agents/.env", file=sys.stderr)
        sys.exit(1)

    app = Application.builder().token(BOT_TOKEN).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("status", status))
    app.add_handler(CommandHandler("tarea", tarea))
    app.add_handler(CommandHandler("nueva", nueva))
    app.add_handler(CommandHandler("log", log))
    app.add_handler(CommandHandler("run", run))
    app.run_polling()


if __name__ == "__main__":
    main()
