"""Indexa specs/sdd/*.md en Qdrant, colección `almacenia_specs`, payload tipo='sdd'.

NO forma parte del pipeline activo: orchestrator.py ya no usa RAG para dar contexto
del SDD al arquitecto (usa el campo "sdd" de cada tarea en tasks.json, que lee el
archivo directo de disco — ver agents/memory/decisiones/flujo-agentes.md para la
causa raíz del bug que llevó a este cambio). El rag.search de specs queda filtrado a
tipo='spec', así que estos puntos indexados no se recuperan desde ahí. Se deja este
script por si en el futuro hace falta indexado difuso del SDD para otro propósito
(ej. detectar inconsistencias entre módulos), no para dar contexto de una tarea puntual.

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
