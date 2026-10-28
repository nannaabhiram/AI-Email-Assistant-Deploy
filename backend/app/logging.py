"""Structured JSON logging with correlation IDs and secret redaction."""

from __future__ import annotations

import logging
import re
import sys
from collections.abc import MutableMapping
from contextvars import ContextVar
from typing import Any

import structlog

request_id_var: ContextVar[str | None] = ContextVar("request_id", default=None)
user_id_var: ContextVar[str | None] = ContextVar("user_id", default=None)

_SENSITIVE_KEYS = re.compile(
    r"(token|secret|password|authorization|api_key|apikey|private_key|refresh|cookie|code_verifier|body|content)",
    re.IGNORECASE,
)
_BEARER = re.compile(r"(Bearer\s+)[A-Za-z0-9\-._~+/]+=*", re.IGNORECASE)
_GOOGLE_TOKEN = re.compile(r"ya29\.[A-Za-z0-9\-_]+|1//[A-Za-z0-9\-_]{20,}")
_JWT = re.compile(r"eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}")
_ALLOWED_KEYS = {"content_length", "content_type", "body_chars", "token_count", "tokens"}


def redact_text(value: str) -> str:
    value = _BEARER.sub(r"\1[REDACTED]", value)
    value = _GOOGLE_TOKEN.sub("[REDACTED]", value)
    return _JWT.sub("[REDACTED_JWT]", value)


def _redact(obj: Any, key: str | None = None) -> Any:
    if key and key not in _ALLOWED_KEYS and _SENSITIVE_KEYS.search(key):
        return "[REDACTED]"
    if isinstance(obj, dict):
        return {k: _redact(v, str(k)) for k, v in obj.items()}
    if isinstance(obj, list | tuple):
        return [_redact(v) for v in obj]
    if isinstance(obj, str):
        return redact_text(obj)
    return obj


def _redaction_processor(_: Any, __: str, event_dict: MutableMapping[str, Any]) -> MutableMapping[str, Any]:
    return {k: (v if k in {"event", "level", "timestamp", "logger"} else _redact(v, k)) for k, v in event_dict.items()}


def _context_processor(_: Any, __: str, event_dict: MutableMapping[str, Any]) -> MutableMapping[str, Any]:
    if (rid := request_id_var.get()) and "request_id" not in event_dict:
        event_dict["request_id"] = rid
    if (uid := user_id_var.get()) and "user_id" not in event_dict:
        event_dict["user_id"] = uid
    return event_dict


def configure_logging(level: str = "INFO", json_output: bool = True) -> None:
    logging.basicConfig(stream=sys.stdout, level=level.upper(), format="%(message)s")
    for noisy in ("httpx", "httpcore", "asyncio"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
    renderer: Any = structlog.processors.JSONRenderer() if json_output else structlog.dev.ConsoleRenderer()
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso", utc=True),
            _context_processor,
            _redaction_processor,
            structlog.processors.format_exc_info,
            renderer,
        ],
        wrapper_class=structlog.make_filtering_bound_logger(logging.getLevelName(level.upper())),
        cache_logger_on_first_use=True,
    )


def get_logger(name: str | None = None) -> structlog.stdlib.BoundLogger:
    return structlog.get_logger(name)
