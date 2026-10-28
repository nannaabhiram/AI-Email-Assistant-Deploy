"""Optional embeddings client (OpenAI-compatible /embeddings on approved infrastructure only)."""

from __future__ import annotations

import httpx

from app.config import get_settings
from app.llm.base import LLMNotConfiguredError, LLMUnavailableError


async def embed(texts: list[str]) -> list[list[float]]:
    settings = get_settings()
    if not settings.embeddings_configured:
        raise LLMNotConfiguredError("Embeddings are not configured")
    headers = {}
    if key := settings.embedding_api_key.get_secret_value():
        headers["Authorization"] = f"Bearer {key}"
    try:
        async with httpx.AsyncClient(timeout=settings.llm_request_timeout) as client:
            resp = await client.post(
                f"{settings.embedding_api_base_url.rstrip('/')}/embeddings",
                json={"model": settings.embedding_model, "input": [t[:8000] for t in texts]},
                headers=headers,
            )
    except httpx.HTTPError as exc:
        raise LLMUnavailableError(f"Embedding endpoint unreachable: {type(exc).__name__}") from exc
    if resp.status_code >= 400:
        raise LLMUnavailableError(f"Embedding endpoint error HTTP {resp.status_code}")
    data = sorted(resp.json()["data"], key=lambda d: d["index"])
    return [d["embedding"] for d in data]


def to_pgvector(vec: list[float]) -> str:
    return "[" + ",".join(f"{v:.6f}" for v in vec) + "]"
