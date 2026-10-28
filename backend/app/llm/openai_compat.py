"""OpenAI-compatible chat-completions provider (vLLM, SGLang, TensorRT-LLM, NIM, llama.cpp).

Talks only to the configured DGX endpoint (typically reached through an SSH tunnel).
"""

from __future__ import annotations

import time
from typing import Any

import httpx

from app.config import Settings
from app.llm.base import (
    ChatMessage,
    CompletionResult,
    HealthReport,
    LLMNotConfiguredError,
    LLMRequestRejectedError,
    LLMTimeoutError,
    LLMUnavailableError,
)


class OpenAICompatibleProvider:
    name = "openai-compatible"

    def __init__(self, settings: Settings, http: httpx.AsyncClient | None = None) -> None:
        if not settings.llm_configured:
            raise LLMNotConfiguredError("DGX_LLM_API_BASE_URL and DGX_LLM_MODEL must be configured")
        self._settings = settings
        self._base = settings.dgx_llm_api_base_url.rstrip("/")
        self._model = settings.dgx_llm_model
        headers = {"Content-Type": "application/json"}
        if key := settings.dgx_llm_api_key.get_secret_value():
            headers["Authorization"] = f"Bearer {key}"
        self._http = http or httpx.AsyncClient(
            timeout=httpx.Timeout(settings.llm_request_timeout, connect=settings.llm_connect_timeout),
            headers=headers,
        )
        if http is not None:
            self._http.headers.update(headers)

    async def aclose(self) -> None:
        await self._http.aclose()

    def _response_format(self, json_schema: dict[str, Any] | None, schema_name: str) -> dict[str, Any] | None:
        mode = self._settings.dgx_llm_structured_output
        if json_schema is None or mode == "prompt":
            return None
        if mode == "json_object":
            return {"type": "json_object"}
        return {"type": "json_schema", "json_schema": {"name": schema_name, "schema": json_schema, "strict": True}}

    async def complete(
        self,
        messages: list[ChatMessage],
        *,
        json_schema: dict[str, Any] | None,
        schema_name: str,
        max_tokens: int,
        temperature: float,
        request_id: str,
    ) -> CompletionResult:
        body: dict[str, Any] = {
            "model": self._model,
            "messages": [{"role": m.role, "content": m.content} for m in messages],
            "max_tokens": max_tokens,
            "temperature": temperature,
            "stream": False,
        }
        if (fmt := self._response_format(json_schema, schema_name)) is not None:
            body["response_format"] = fmt
        try:
            resp = await self._http.post(f"{self._base}/chat/completions", json=body,
                                         headers={"X-Request-ID": request_id})
        except httpx.TimeoutException as exc:
            raise LLMTimeoutError(f"Inference request timed out ({type(exc).__name__})") from exc
        except httpx.TransportError as exc:
            raise LLMUnavailableError(f"Cannot reach inference server: {type(exc).__name__}") from exc

        if resp.status_code in (502, 503, 504):
            raise LLMUnavailableError(f"Inference server unavailable (HTTP {resp.status_code})")
        if resp.status_code == 429:
            raise LLMUnavailableError("Inference server is overloaded (HTTP 429)")
        if resp.status_code >= 400:
            raise LLMRequestRejectedError(f"Inference server rejected the request (HTTP {resp.status_code})")
        try:
            data = resp.json()
            choice = data["choices"][0]
            text = choice["message"].get("content") or ""
        except (ValueError, KeyError, IndexError) as exc:
            raise LLMRequestRejectedError("Inference server returned an unexpected response shape") from exc
        return CompletionResult(
            text=text, model=data.get("model", self._model), finish_reason=choice.get("finish_reason"),
            usage=data.get("usage") or {},
        )

    async def health(self) -> HealthReport:
        start = time.perf_counter()
        try:
            resp = await self._http.get(f"{self._base}/models", timeout=self._settings.llm_connect_timeout + 5)
            latency = int((time.perf_counter() - start) * 1000)
            if resp.status_code >= 400:
                return HealthReport(False, latency, self._model, False, [], f"HTTP {resp.status_code} from /models")
            models = [m.get("id", "") for m in resp.json().get("data", [])]
            return HealthReport(True, latency, self._model, self._model in models, models)
        except httpx.HTTPError as exc:
            return HealthReport(False, None, self._model, False, [], f"{type(exc).__name__}: cannot reach endpoint")
        except ValueError:
            return HealthReport(False, None, self._model, False, [], "Endpoint did not return JSON")
