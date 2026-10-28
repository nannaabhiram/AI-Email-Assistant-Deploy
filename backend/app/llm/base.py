"""Provider-neutral LLM interface."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Protocol


class LLMError(Exception):
    code = "llm_error"
    retryable = False


class LLMNotConfiguredError(LLMError):
    code = "not_configured"


class LLMUnavailableError(LLMError):
    """Remote inference cannot be reached (DGX down, tunnel closed, server not running)."""

    code = "unavailable"
    retryable = True


class LLMTimeoutError(LLMError):
    code = "timeout"
    retryable = True


class LLMInvalidOutputError(LLMError):
    code = "invalid_output"


class LLMRequestRejectedError(LLMError):
    code = "rejected"


@dataclass(slots=True)
class ChatMessage:
    role: str  # "system" | "user" | "assistant"
    content: str


@dataclass(slots=True)
class CompletionResult:
    text: str
    model: str
    finish_reason: str | None = None
    usage: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class HealthReport:
    reachable: bool
    latency_ms: int | None
    configured_model: str
    model_available: bool
    available_models: list[str]
    error: str | None = None


class LLMProvider(Protocol):
    name: str

    async def complete(
        self,
        messages: list[ChatMessage],
        *,
        json_schema: dict[str, Any] | None,
        schema_name: str,
        max_tokens: int,
        temperature: float,
        request_id: str,
    ) -> CompletionResult: ...

    async def health(self) -> HealthReport: ...

    async def aclose(self) -> None: ...
