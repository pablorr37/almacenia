"""Utilidades compartidas por los roles del orquestador."""
from __future__ import annotations

import re

_FENCE_RE = re.compile(r"^```[a-zA-Z]*\n|\n```\s*$")


def strip_code_fences(text: str) -> str:
    """Quita bloques ```lang ... ``` que el modelo agrega pese a que se le pide no hacerlo."""
    stripped = text.strip()
    stripped = _FENCE_RE.sub("", stripped)
    return stripped.strip()


def ensure_exports(code: str) -> str:
    """Fuerza `export` en declaraciones top-level de function/class/const que no
    lo tengan, ya que el modelo a veces ignora la instrucción de exportar."""
    return re.sub(
        r"^(function|class|const|async function)\s",
        r"export \1 ",
        code,
        flags=re.MULTILINE,
    )
