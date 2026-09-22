"""Wrapper de memoria RAG (Qdrant + Ollama embeddings) para los agentes SDD+TDD."""
from __future__ import annotations

import os
import uuid

import ollama
from qdrant_client import QdrantClient
from qdrant_client.http import models as qmodels

QDRANT_URL = os.environ.get("QDRANT_URL", "http://localhost:6333")
OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434")
EMBED_MODEL = os.environ.get("OLLAMA_MODEL_EMBED", "nomic-embed-text")
EMBED_DIM = 768  # dimensión de nomic-embed-text


class RAGManager:
    def __init__(self, qdrant_url: str = QDRANT_URL, ollama_url: str = OLLAMA_URL):
        self.client = QdrantClient(url=qdrant_url)
        self.ollama_client = ollama.Client(host=ollama_url)

    def _ensure_collection(self, collection: str) -> None:
        existing = [c.name for c in self.client.get_collections().collections]
        if collection not in existing:
            self.client.create_collection(
                collection_name=collection,
                vectors_config=qmodels.VectorParams(
                    size=EMBED_DIM, distance=qmodels.Distance.COSINE
                ),
            )

    def _embed(self, text: str) -> list[float]:
        response = self.ollama_client.embed(model=EMBED_MODEL, input=text)
        return response["embeddings"][0]

    def index(self, collection: str, content: str, payload: dict) -> None:
        self._ensure_collection(collection)
        vector = self._embed(content)
        point = qmodels.PointStruct(
            id=str(uuid.uuid4()),
            vector=vector,
            payload={**payload, "content": content},
        )
        self.client.upsert(collection_name=collection, points=[point])

    def search(self, collection: str, query: str, limit: int = 5) -> list[dict]:
        self._ensure_collection(collection)
        vector = self._embed(query)
        results = self.client.query_points(
            collection_name=collection, query=vector, limit=limit
        )
        return [point.payload for point in results.points]
