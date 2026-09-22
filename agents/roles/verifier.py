"""Fase 4: corre los tests generados contra el código generado y reporta el resultado."""
from __future__ import annotations

import subprocess
from dataclasses import dataclass


@dataclass
class VerificationResult:
    passed: bool
    output: str


def run_tests(test_file_path: str) -> VerificationResult:
    """Corre Vitest sobre un archivo de test puntual y devuelve el resultado."""
    result = subprocess.run(
        ["npx", "vitest", "run", test_file_path],
        capture_output=True,
        text=True,
        cwd=".",
        shell=True,
    )
    output = result.stdout + result.stderr
    return VerificationResult(passed=result.returncode == 0, output=output)
