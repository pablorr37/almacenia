"""Fase 4: corre los tests generados contra el código generado y reporta el resultado."""
from __future__ import annotations

import subprocess
from dataclasses import dataclass
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent.parent


@dataclass
class VerificationResult:
    passed: bool
    output: str


def run_tests(test_file_path: str) -> VerificationResult:
    """Corre Vitest sobre un archivo de test puntual y devuelve el resultado.

    Vitest necesita correr desde la raíz del proyecto (donde están vitest.config.ts
    y package.json), independientemente del directorio de trabajo del proceso que
    llama a esta función (el orquestador se invoca desde agents/, no desde la raíz).
    """
    result = subprocess.run(
        ["npx", "vitest", "run", test_file_path],
        capture_output=True,
        text=True,
        cwd=str(PROJECT_ROOT),
        shell=True,
    )
    output = result.stdout + result.stderr
    return VerificationResult(passed=result.returncode == 0, output=output)
