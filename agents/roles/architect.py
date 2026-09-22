"""Fase 1: el agente arquitecto redacta la spec técnica de un módulo."""
from __future__ import annotations

import os

import ollama

MODEL = os.environ.get("OLLAMA_MODEL_ARCHITECT", "deepseek-r1:8b")
OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434")

SYSTEM_PROMPT = """Sos el agente arquitecto de Almacenia, un sistema de gestión de \
almacenes/kioscos/verdulerías con feature de vendedor (tienda, catálogo, pedidos, \
gestión interna) y feature de comprador (mapa, itinerario de compra). Escribís specs \
técnicas claras en español, en formato markdown, con estas secciones obligatorias:

## Requisitos funcionales
## Firmas de funciones/clases (TypeScript)
## Casos de error a contemplar
## Casos de prueba esperados (para el agente de tests)

No escribas código de implementación, solo la spec."""


def write_spec(modulo: str, objetivo: str, contexto_previo: list[dict]) -> str:
    client = ollama.Client(host=OLLAMA_URL)
    contexto = "\n\n".join(c.get("content", "") for c in contexto_previo)
    user_prompt = (
        f"Módulo: {modulo}\nObjetivo: {objetivo}\n\n"
        f"Specs/decisiones relacionadas previas:\n{contexto or '(sin contexto previo)'}\n\n"
        "Escribí la spec técnica de este módulo."
    )
    response = client.chat(
        model=MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        options={"num_ctx": 16384},
    )
    return response["message"]["content"]
