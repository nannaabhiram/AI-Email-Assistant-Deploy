"""Symmetric encryption for OAuth tokens at rest, plus hashing helpers."""

from __future__ import annotations

import hashlib
import hmac
import json
from typing import Any

from cryptography.fernet import Fernet, InvalidToken

from app.config import get_settings
from app.errors import NotConfiguredError


def _fernet() -> Fernet:
    key = get_settings().token_encryption_key.get_secret_value()
    if not key:
        raise NotConfiguredError("TOKEN_ENCRYPTION_KEY is not configured", code="encryption_not_configured")
    return Fernet(key.encode())


def encrypt(value: str) -> str:
    return _fernet().encrypt(value.encode()).decode()


def decrypt(value: str) -> str:
    try:
        return _fernet().decrypt(value.encode()).decode()
    except InvalidToken as exc:
        raise NotConfiguredError("Stored credential cannot be decrypted (key changed?)", code="decrypt_failed") from exc


def sha256_hex(value: str | bytes) -> str:
    data = value.encode() if isinstance(value, str) else value
    return hashlib.sha256(data).hexdigest()


def canonical_hash(payload: dict[str, Any]) -> str:
    """Stable hash of action parameters used to bind approvals to exact content."""
    return sha256_hex(json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False, default=str))


def constant_time_equals(a: str, b: str) -> bool:
    return hmac.compare_digest(a.encode(), b.encode())
