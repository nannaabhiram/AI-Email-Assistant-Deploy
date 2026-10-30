"""Token-bucket rate limiting keyed by user and route group.

With ``RATE_LIMIT_REDIS_URL`` set, buckets live in Redis and are shared by every API instance
(one atomic Lua script per request). Without it, or while Redis is unreachable, an in-process
limiter is used, which is correct for a single instance and a per-instance backstop otherwise.
"""

from __future__ import annotations

import time
from collections import OrderedDict
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any

from fastapi import Depends

from app.config import get_settings
from app.errors import RateLimitedError
from app.logging import get_logger
from app.security.auth import CurrentUser, get_current_user

log = get_logger(__name__)

# KEYS[1] bucket key; ARGV: capacity, refill per second, now (seconds). Returns {allowed, retry_after_seconds}.
_TOKEN_BUCKET_LUA = """
local capacity = tonumber(ARGV[1])
local rate = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local state = redis.call('HMGET', KEYS[1], 'tokens', 'updated')
local tokens = tonumber(state[1]) or capacity
local updated = tonumber(state[2]) or now
tokens = math.min(capacity, tokens + math.max(0, now - updated) * rate)
local allowed = 0
local retry = 0
if tokens >= 1 then
  tokens = tokens - 1
  allowed = 1
else
  retry = math.floor((1 - tokens) / rate) + 1
end
redis.call('HSET', KEYS[1], 'tokens', tokens, 'updated', now)
redis.call('EXPIRE', KEYS[1], math.ceil(capacity / rate) + 60)
return {allowed, retry}
"""


@dataclass
class _Bucket:
    tokens: float
    updated: float


class RateLimiter:
    """In-process limiter. Least-recently-used buckets are evicted beyond ``max_buckets``; an evicted
    bucket was idle longest, so it would have refilled anyway."""

    def __init__(self, max_buckets: int = 50_000) -> None:
        self._buckets: OrderedDict[str, _Bucket] = OrderedDict()
        self._max_buckets = max_buckets

    def hit(self, key: str, per_minute: int) -> None:
        now = time.monotonic()
        rate = per_minute / 60.0
        bucket = self._buckets.get(key)
        if bucket is None:
            bucket = _Bucket(tokens=float(per_minute), updated=now)
            self._buckets[key] = bucket
            if len(self._buckets) > self._max_buckets:
                self._buckets.popitem(last=False)
        else:
            self._buckets.move_to_end(key)
        bucket.tokens = min(float(per_minute), bucket.tokens + (now - bucket.updated) * rate)
        bucket.updated = now
        if bucket.tokens < 1.0:
            retry = int((1.0 - bucket.tokens) / rate) + 1
            raise RateLimitedError("Too many requests", details={"retry_after_seconds": retry})
        bucket.tokens -= 1.0

    def reset(self) -> None:
        self._buckets.clear()


class RedisRateLimiter:
    """Shared limiter. Falls back to ``fallback`` while Redis is unreachable so an outage never blocks the API."""

    def __init__(self, client: Any, fallback: RateLimiter, prefix: str = "mailpilot:rl:") -> None:
        self._client = client
        self._script = client.register_script(_TOKEN_BUCKET_LUA)
        self._fallback = fallback
        self._prefix = prefix
        self._degraded = False

    async def hit(self, key: str, per_minute: int) -> None:
        try:
            allowed, retry = await self._script(keys=[self._prefix + key], args=[per_minute, per_minute / 60.0, time.time()])
        except Exception as exc:  # any Redis failure: degrade to the in-process limiter
            if not self._degraded:
                log.warning("rate_limit_redis_unavailable", error_type=type(exc).__name__)
                self._degraded = True
            self._fallback.hit(key, per_minute)
            return
        if self._degraded:
            log.info("rate_limit_redis_recovered")
            self._degraded = False
        if not int(allowed):
            raise RateLimitedError("Too many requests", details={"retry_after_seconds": int(retry)})


limiter = RateLimiter()
_shared: RedisRateLimiter | None = None


def get_shared_limiter() -> RedisRateLimiter | None:
    global _shared
    url = get_settings().rate_limit_redis_url
    if not url:
        return None
    if _shared is None:
        from redis.asyncio import Redis

        _shared = RedisRateLimiter(Redis.from_url(url, socket_timeout=0.5, socket_connect_timeout=0.5), limiter)
    return _shared


def set_shared_limiter(shared: RedisRateLimiter | None) -> None:
    """Override the shared limiter (tests)."""
    global _shared
    _shared = shared


def rate_limit(group: str, sensitive: bool = False) -> Callable[..., Awaitable[CurrentUser]]:
    async def _dep(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        settings = get_settings()
        per_minute = settings.sensitive_rate_limit_per_minute if sensitive else settings.rate_limit_per_minute
        key = f"{user.id}:{group}"
        shared = get_shared_limiter()
        if shared is not None:
            await shared.hit(key, per_minute)
        else:
            limiter.hit(key, per_minute)
        return user

    return _dep
