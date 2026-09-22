"""Orquestador SDD+TDD: Spec -> Test -> Code -> Verificación, por tarea.

Uso: python agents/orchestrator.py
Requiere infra/docker-compose.yml levantado (Qdrant + Ollama) y modelos descargados.
"""
from __future__ import annotations

import json
import os
from pathlib import Path

from rag_manager import RAGManager
from roles import architect, developer, test_writer, verifier

TASKS_FILE = Path(__file__).parent / "tasks" / "tasks.json"
OUTPUT_DIR = Path(__file__).parent.parent / "src" / "generated"
SDD_DIR = Path(__file__).parent.parent / "specs" / "sdd"
MAX_INTENTOS = 3

COLLECTION_SPECS = os.environ.get("QDRANT_COLLECTION_SPECS", "almacenia_specs")
COLLECTION_CODE = os.environ.get("QDRANT_COLLECTION_CODE", "almacenia_code")


def cargar_tareas() -> dict:
    with open(TASKS_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def guardar_tareas(data: dict) -> None:
    with open(TASKS_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def _parece_error_de_sintaxis(resultado_output: str) -> bool:
    marcadores = ("PARSE_ERROR", "Transform failed", "Unexpected token")
    return any(m in resultado_output for m in marcadores)


def procesar_tarea(tarea: dict, rag: RAGManager) -> None:
    modulo = tarea["modulo"]
    objetivo = tarea["objetivo"]
    print(f"\n=== Tarea {tarea['id']}: {modulo} ===")

    # Fase 1: Spec
    contexto = rag.search(
        COLLECTION_SPECS, objetivo, limit=3, filtro_payload={"tipo": "spec"}
    )
    sdd_referencia = None
    if tarea.get("sdd"):
        sdd_referencia = (SDD_DIR / tarea["sdd"]).read_text(encoding="utf-8")
    spec = architect.write_spec(modulo, objetivo, contexto, sdd_referencia)
    rag.index(COLLECTION_SPECS, spec, {"modulo": modulo, "tipo": "spec"})
    spec_path = Path(__file__).parent.parent / "specs" / f"{modulo}_spec.md"
    spec_path.parent.mkdir(parents=True, exist_ok=True)
    spec_path.write_text(spec, encoding="utf-8")
    print(f"[1/4] Spec generada -> {spec_path}")

    # Fase 2: Tests
    tests = test_writer.write_tests(modulo, spec)
    tests_path = Path(__file__).parent.parent / "src" / "generated" / f"{modulo}.test.ts"
    tests_path.parent.mkdir(parents=True, exist_ok=True)
    tests_path.write_text(tests, encoding="utf-8")
    print(f"[2/4] Tests generados -> {tests_path}")

    # Fase 3 + 4: Code -> Verificación, con reintentos
    resultado_anterior = None
    for intento in range(1, MAX_INTENTOS + 1):
        if resultado_anterior and _parece_error_de_sintaxis(resultado_anterior):
            print("[2/4] Los tests tienen un error de sintaxis, regenerando...")
            tests = test_writer.write_tests(modulo, spec)
            tests_path.write_text(tests, encoding="utf-8")

        codigo = developer.write_code(modulo, spec, tests, resultado_anterior)
        code_path = Path(__file__).parent.parent / "src" / "generated" / f"{modulo}.ts"
        code_path.write_text(codigo, encoding="utf-8")
        print(f"[3/4] Código generado (intento {intento}) -> {code_path}")

        resultado = verifier.run_tests(str(tests_path))
        print(f"[4/4] Verificación: {'OK' if resultado.passed else 'FALLÓ'}")

        if resultado.passed:
            rag.index(COLLECTION_CODE, codigo, {"modulo": modulo, "tipo": "codigo"})
            tarea["status"] = "hecho"
            tarea["intentos"] = intento
            return

        resultado_anterior = resultado.output

    tarea["status"] = "bloqueada"
    tarea["intentos"] = MAX_INTENTOS


def main() -> None:
    rag = RAGManager()
    data = cargar_tareas()
    for tarea in data["tareas"]:
        if tarea["status"] == "pendiente":
            procesar_tarea(tarea, rag)
            guardar_tareas(data)


if __name__ == "__main__":
    main()
