"""Fase 2: el agente de tests escribe tests (Vitest) a partir de la spec."""
from __future__ import annotations

import os

import ollama

from text_utils import strip_code_fences

MODEL = os.environ.get("OLLAMA_MODEL_ARCHITECT", "deepseek-r1:8b")
OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434")

SYSTEM_PROMPT = """Sos el agente de tests de Almacenia. Recibís una spec técnica en \
markdown (con firmas de funciones en TypeScript) y escribís tests con Vitest que \
cubran los requisitos funcionales y los casos de error listados en la spec. \
Devolvé únicamente el código del archivo de test en TypeScript, sin explicaciones \
ni bloques de markdown."""


def write_tests(modulo: str, spec: str) -> str:
    client = ollama.Client(host=OLLAMA_URL)
    user_prompt = f"Spec del módulo `{modulo}`:\n\n{spec}\n\nEscribí el archivo de tests."
    response = client.chat(
        model=MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        options={"num_ctx": 16384},
    )
    return strip_code_fences(response["message"]["content"])
