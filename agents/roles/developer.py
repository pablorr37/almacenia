"""Fase 3: el agente desarrollador implementa código hasta pasar los tests."""
from __future__ import annotations

import os

import ollama

from text_utils import ensure_exports, strip_code_fences

MODEL = os.environ.get("OLLAMA_MODEL_DEVELOPER", "qwen2.5-coder:7b")
OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434")

SYSTEM_PROMPT = """Sos el agente desarrollador de Almacenia. Recibís una spec técnica, \
el archivo de tests (Vitest/TypeScript) que debe pasar, y opcionalmente el resultado \
de un intento anterior fallido. Escribís el código de implementación en TypeScript \
que satisface la spec y hace pasar todos los tests.

Reglas estrictas:
- Toda función o clase que el archivo de tests importe debe declararse con `export` \
  (p. ej. `export function nombre(...) { ... }`), usando exactamente los mismos \
  nombres que aparecen en los `import { ... } from './modulo'` del archivo de tests.
- No uses `export default`.
- Devolvé únicamente el código del archivo de implementación, sin explicaciones ni \
  bloques de markdown (nada de ```typescript ni ```)."""


def write_code(modulo: str, spec: str, tests: str, intento_anterior: str | None = None) -> str:
    client = ollama.Client(host=OLLAMA_URL)
    partes = [f"Spec del módulo `{modulo}`:\n\n{spec}", f"Tests que debe pasar:\n\n{tests}"]
    if intento_anterior:
        partes.append(f"Resultado del intento anterior (falló):\n\n{intento_anterior}")
    user_prompt = "\n\n".join(partes) + "\n\nEscribí el archivo de implementación."
    response = client.chat(
        model=MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        options={"num_ctx": 16384},
    )
    content = response["message"]["content"].replace("\xa0", " ")
    return ensure_exports(strip_code_fences(content))
