"""Indexa specs/sdd/*.md en Qdrant para que el agente arquitecto los tenga como
contexto real (via RAGManager.search) al escribir la spec de una tarea nueva.

Uso: python agents/index_sdd.py
Requiere infra/docker-compose.yml levantado (Qdrant) y Ollama nativo corriendo.
"""
from __future__ import annotations

import os
from pathlib import Path

from rag_manager import RAGManager

SDD_DIR = Path(__file__).parent.parent / "specs" / "sdd"
COLLECTION_SPECS = os.environ.get("QDRANT_COLLECTION_SPECS", "almacenia_specs")


def main() -> None:
    rag = RAGManager()
    for path in sorted(SDD_DIR.glob("*.md")):
        contenido = path.read_text(encoding="utf-8")
        rag.index(COLLECTION_SPECS, contenido, {"modulo": path.stem, "tipo": "sdd"})
        print(f"Indexado: {path.name}")


if __name__ == "__main__":
    main()
