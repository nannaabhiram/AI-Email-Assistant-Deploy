"""LLM orchestration: limits, retries, validation, metrics. Provider-agnostic."""

from __future__ import annotations

import asyncio
import json
import random
import re
import time
import uuid
from dataclasses import dataclass
from typing import Any, TypeVar
from uuid import UUID

from pydantic import BaseModel, ValidationError

from app.config import Settings, get_settings
from app.db.models import LLMCall
from app.db.session import system_session
from app.llm.base import (
    ChatMessage,
    HealthReport,
    LLMError,
    LLMInvalidOutputError,
    LLMNotConfiguredError,
    LLMProvider,
    LLMRequestRejectedError,
    LLMTimeoutError,
    LLMUnavailableError,
)
from app.llm.prompts import wrap_untrusted
from app.logging import get_logger, request_id_var

log = get_logger(__name__)
T = TypeVar("T", bound=BaseModel)

_THINK_RE = re.compile(r"<think>.*?</think>", re.S | re.I)


@dataclass(slots=True)
class LLMMeta:
    request_id: str
    model: str
    latency_ms: int
    attempts: int


def extract_json_object(text: str) -> dict[str, Any]:
    """Parse the first JSON object in model output (tolerates code fences and reasoning tags)."""
    cleaned = _THINK_RE.sub("", text).strip()
    cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", cleaned, flags=re.I | re.M).strip()
    try:
        value = json.loads(cleaned)
    except json.JSONDecodeError:
        start = cleaned.find("{")
        if start < 0:
            raise LLMInvalidOutputError("No JSON object in model output") from None
        try:
            value, _ = json.JSONDecoder().raw_decode(cleaned[start:])
        except json.JSONDecodeError as exc:
            raise LLMInvalidOutputError("Model output is not valid JSON") from exc
    if not isinstance(value, dict):
        raise LLMInvalidOutputError("Model output is not a JSON object")
    return value


def truncate(content: str, limit: int) -> str:
    if len(content) <= limit:
        return content
    head = int(limit * 0.8)
    return content[:head] + "\n[... content truncated ...]\n" + content[-(limit - head - 40):]


class LLMService:
    def __init__(self, provider: LLMProvider | None, settings: Settings | None = None,
                 record_metrics: bool = True) -> None:
        self.settings = settings or get_settings()
        self.provider = provider
        self._semaphore = asyncio.Semaphore(self.settings.llm_max_concurrency)
        self._record_metrics = record_metrics
        self._consecutive_failures = 0
        self._open_until = 0.0

    @property
    def available(self) -> bool:
        return self.provider is not None

    @property
    def circuit_open(self) -> bool:
        return time.monotonic() < self._open_until

    @property
    def circuit_retry_seconds(self) -> int:
        return max(0, int(self._open_until - time.monotonic()) + 1)

    def _record_outcome(self, reachable: bool) -> None:
        if reachable:
            self._consecutive_failures = 0
            self._open_until = 0.0
            return
        self._consecutive_failures += 1
        if self._consecutive_failures >= self.settings.llm_breaker_threshold:
            self._open_until = time.monotonic() + self.settings.llm_breaker_cooldown_seconds
            log.warning("llm_circuit_opened", failures=self._consecutive_failures,
                        cooldown_seconds=self.settings.llm_breaker_cooldown_seconds)

    @property
    def model_name(self) -> str:
        return self.settings.dgx_llm_model

    async def health(self) -> HealthReport:
        if self.provider is None:
            problem = self.settings.llm_endpoint_problem or "LLM endpoint not configured"
            return HealthReport(False, None, self.settings.dgx_llm_model, False, [], problem)
        return await self.provider.health()

    async def generate(
        self,
        *,
        task: str,
        system_prompt: str,
        untrusted: dict[str, str],
        trusted_context: str,
        output_model: type[T],
        user_id: UUID | None = None,
        max_tokens: int | None = None,
    ) -> tuple[T, LLMMeta]:
        if self.provider is None:
            raise LLMNotConfiguredError("Remote inference is not configured")
        if self.circuit_open:
            raise LLMUnavailableError(f"Remote inference circuit open; retry in {self.circuit_retry_seconds}s")
        budget = self.settings.llm_max_input_chars
        per_block = max(1000, budget // max(1, len(untrusted)))
        blocks = [wrap_untrusted(label, truncate(content, per_block)) for label, content in untrusted.items()]
        schema = output_model.model_json_schema()
        user_content = (
            f"{trusted_context}\n\nReturn JSON matching this schema:\n{json.dumps(schema, separators=(',', ':'))}"
            "\n\n" + "\n\n".join(blocks)
        )
        if len(user_content) > budget + 20000:
            raise LLMRequestRejectedError("Request exceeds configured size limit")
        messages = [ChatMessage("system", system_prompt), ChatMessage("user", user_content)]
        request_id = f"{request_id_var.get() or 'job'}-{uuid.uuid4().hex[:8]}"
        max_tokens = max_tokens or self.settings.llm_max_output_tokens

        start = time.perf_counter()
        attempts = 0
        status, error_code, output_chars = "error", None, 0
        try:
            async with self._semaphore:
                last_exc: LLMError | None = None
                while attempts <= self.settings.llm_max_retries:
                    attempts += 1
                    try:
                        result = await self.provider.complete(
                            messages, json_schema=schema, schema_name=task, max_tokens=max_tokens,
                            temperature=self.settings.llm_temperature, request_id=request_id,
                        )
                        self._record_outcome(reachable=True)
                        output_chars = len(result.text)
                        try:
                            parsed = output_model.model_validate(extract_json_object(result.text))
                        except (LLMInvalidOutputError, ValidationError) as exc:
                            if attempts > self.settings.llm_max_retries:
                                raise LLMInvalidOutputError(f"Output failed validation: {_short(exc)}") from exc
                            messages = [*messages[:2], ChatMessage("assistant", result.text[:4000]), ChatMessage(
                                "user",
                                "Your previous output did not match the schema "
                                f"({_short(exc)}). Return only the corrected JSON object.",
                            )]
                            continue
                        status = "ok"
                        latency = int((time.perf_counter() - start) * 1000)
                        return parsed, LLMMeta(request_id, result.model, latency, attempts)
                    except (LLMUnavailableError, LLMTimeoutError) as exc:
                        last_exc = exc
                        self._record_outcome(reachable=False)
                        if attempts > self.settings.llm_max_retries or self.circuit_open:
                            raise
                        await asyncio.sleep(min(8.0, 0.5 * 2**attempts + random.uniform(0, 0.5)))
                raise last_exc or LLMInvalidOutputError("Exhausted retries")
        except LLMError as exc:
            status = {"timeout": "timeout", "unavailable": "unavailable", "invalid_output": "invalid_output",
                      "rejected": "rejected"}.get(exc.code, "error")
            error_code = exc.code
            log.warning("llm_call_failed", task=task, status=status, attempts=attempts, llm_request_id=request_id)
            raise
        finally:
            await self._record(user_id, request_id, task, status, int((time.perf_counter() - start) * 1000),
                               len(user_content), output_chars, attempts, error_code)

    async def _record(self, user_id: UUID | None, request_id: str, task: str, status: str, latency_ms: int,
                      input_chars: int, output_chars: int, attempts: int, error_code: str | None) -> None:
        log.info("llm_call", task=task, status=status, latency_ms=latency_ms, attempts=attempts,
                 llm_request_id=request_id)
        if not self._record_metrics:
            return
        try:
            async with system_session() as session:
                session.add(LLMCall(user_id=user_id, request_id=request_id, task=task, model=self.model_name,
                                    status=status, latency_ms=latency_ms, input_chars=input_chars,
                                    output_chars=output_chars, attempts=attempts, error_code=error_code))
        except Exception:  # metrics must never break the main flow
            log.warning("llm_metrics_write_failed")


def _short(exc: Exception) -> str:
    return str(exc).replace("\n", " ")[:300]


def inference_state(configured: bool, report: HealthReport) -> str:
    """One status for the UI: not_configured | unreachable | model_missing | available."""
    if not configured:
        return "not_configured"
    if not report.reachable:
        return "unreachable"
    return "available" if report.model_available else "model_missing"


_service: LLMService | None = None


def get_llm_service() -> LLMService:
    global _service
    if _service is None:
        settings = get_settings()
        provider: LLMProvider | None = None
        if settings.llm_configured:
            from app.llm.openai_compat import OpenAICompatibleProvider

            provider = OpenAICompatibleProvider(settings)
        _service = LLMService(provider, settings)
    return _service


def set_llm_service(service: LLMService | None) -> None:
    """Override the singleton (tests)."""
    global _service
    _service = service
