"""Fase 2: el agente de tests escribe tests (Vitest) a partir de la spec."""
from __future__ import annotations

import os

import ollama

from text_utils import strip_code_fences

MODEL = os.environ.get("OLLAMA_MODEL_ARCHITECT", "deepseek-r1:8b")
OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434")

SYSTEM_PROMPT = """Sos el agente de tests de Almacenia. Recibís una spec técnica en \
markdown (con firmas de funciones en TypeScript) y escribís tests con Vitest que \
cubran los requisitos funcionales y los casos de error listados en la spec.

El proyecto usa TypeScript en modo `strict`. Reglas obligatorias para que el archivo \
compile sin errores de tipos:
- En todo `catch (error)`, `error` es de tipo `unknown`: para acceder a `.message` \
  usá `catch (error) { const e = error as Error; ... }` (o casteá inline `(error as Error).message`).
- Cuando pases a propósito un valor de tipo inválido para probar una validación en \
  runtime (ej. un string donde se espera number, o un objeto incompleto), casteá ese \
  valor con `as any` en el momento de pasarlo como argumento.
- No inventes datos de ejemplo (coordenadas, IDs, montos) que requieran cálculos \
  externos para verificar el resultado esperado; si necesitás un valor esperado \
  numérico, derivalo de los mismos datos de entrada del test (ej. comparando contra \
  el resultado de aplicar la fórmula descripta en la spec), no un número que no \
  puedas justificar.

Devolvé únicamente el código del archivo de test en TypeScript, sin explicaciones \
ni bloques de markdown."""


def write_tests(modulo: str, spec: str) -> str:
    client = ollama.Client(host=OLLAMA_URL)
    user_prompt = (
        f"Spec del módulo `{modulo}`:\n\n{spec}\n\n"
        f"El archivo de implementación se va a llamar exactamente `{modulo}.ts` y va a "
        f"estar en la misma carpeta que este test. Tu import tiene que ser exactamente "
        f"`import {{ ... }} from './{modulo}';` (con los nombres de función/clase que "
        f"correspondan de la spec) — no inventes ni acortes ese nombre de archivo.\n\n"
        "Escribí el archivo de tests."
    )
    response = client.chat(
        model=MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        options={"num_ctx": 16384},
    )
    return strip_code_fences(response["message"]["content"])
