"""In-process token-bucket rate limiting keyed by user and route group.

Suitable for a single API instance. For horizontally scaled deployments put a shared
limiter (e.g. at the reverse proxy) in front; this remains a per-instance backstop.
"""

from __future__ import annotations

import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass

from fastapi import Depends

from app.config import get_settings
from app.errors import RateLimitedError
from app.security.auth import CurrentUser, get_current_user


@dataclass
class _Bucket:
    tokens: float
    updated: float


class RateLimiter:
    def __init__(self) -> None:
        self._buckets: dict[str, _Bucket] = {}

    def hit(self, key: str, per_minute: int) -> None:
        now = time.monotonic()
        rate = per_minute / 60.0
        bucket = self._buckets.get(key)
        if bucket is None:
            bucket = _Bucket(tokens=float(per_minute), updated=now)
            self._buckets[key] = bucket
        bucket.tokens = min(float(per_minute), bucket.tokens + (now - bucket.updated) * rate)
        bucket.updated = now
        if bucket.tokens < 1.0:
            retry = int((1.0 - bucket.tokens) / rate) + 1
            raise RateLimitedError("Too many requests", details={"retry_after_seconds": retry})
        bucket.tokens -= 1.0
        if len(self._buckets) > 50_000:
            self._buckets.clear()

    def reset(self) -> None:
        self._buckets.clear()


limiter = RateLimiter()


def rate_limit(group: str, sensitive: bool = False) -> Callable[..., Awaitable[CurrentUser]]:
    async def _dep(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        settings = get_settings()
        per_minute = settings.sensitive_rate_limit_per_minute if sensitive else settings.rate_limit_per_minute
        limiter.hit(f"{user.id}:{group}", per_minute)
        return user

    return _dep
