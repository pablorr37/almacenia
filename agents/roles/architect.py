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

No escribas código de implementación, solo la spec.

Cuando recibas un "documento de referencia del módulo", es contexto de fondo — el
alcance real de tu spec lo define ÚNICAMENTE el "objetivo de esta tarea". Si el
objetivo pide una sola función, tu spec documenta esa función sola, no el resto de
las funciones/endpoints que aparezcan en el documento de referencia."""


def write_spec(
    modulo: str,
    objetivo: str,
    contexto_previo: list[dict],
    sdd_referencia: str | None = None,
) -> str:
    client = ollama.Client(host=OLLAMA_URL)
    contexto = "\n\n".join(c.get("content", "") for c in contexto_previo)
    partes = []
    if sdd_referencia:
        partes.append(
            "Documento de referencia del módulo (spec completa del SDD del proyecto, "
            "SOLO para contexto de modelo de datos/convenciones — tu tarea es escribir "
            "la spec de la función o feature PUNTUAL pedida en el objetivo de abajo, "
            "NO redocumentar el módulo entero ni copiar sus endpoints/otras funciones):\n"
            f"{sdd_referencia}"
        )
    partes.append(
        "Tareas previas relacionadas (para mantener consistencia de nombres/tipos, "
        f"no son parte del objetivo actual):\n{contexto or '(sin tareas previas relacionadas)'}"
    )
    partes.append(
        f"Objetivo de ESTA tarea — esto es lo único que tenés que especificar:\n"
        f"Módulo: {modulo}\n{objetivo}"
    )
    user_prompt = "\n\n---\n\n".join(partes) + "\n\nEscribí la spec técnica de este objetivo puntual."
    response = client.chat(
        model=MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        options={"num_ctx": 16384},
    )
    return response["message"]["content"]
