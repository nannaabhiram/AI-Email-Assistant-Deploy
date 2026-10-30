import fakeredis
import pytest

from app.errors import RateLimitedError
from app.security.ratelimit import RateLimiter, RedisRateLimiter


def test_memory_limiter_blocks_after_capacity_and_evicts_lru() -> None:
    limiter = RateLimiter(max_buckets=2)
    for _ in range(3):
        limiter.hit("a", 3)
    with pytest.raises(RateLimitedError) as exc:
        limiter.hit("a", 3)
    assert exc.value.details["retry_after_seconds"] >= 1
    limiter.hit("b", 3)
    limiter.hit("c", 3)  # evicts "a", the least recently used
    assert list(limiter._buckets) == ["b", "c"]


async def test_redis_limit_is_shared_between_instances() -> None:
    server = fakeredis.FakeServer()
    first = RedisRateLimiter(fakeredis.FakeAsyncRedis(server=server), RateLimiter())
    second = RedisRateLimiter(fakeredis.FakeAsyncRedis(server=server), RateLimiter())
    await first.hit("user:api", 2)
    await second.hit("user:api", 2)
    with pytest.raises(RateLimitedError):
        await first.hit("user:api", 2)
    await second.hit("other:api", 2)


async def test_redis_outage_falls_back_to_memory() -> None:
    server = fakeredis.FakeServer()
    server.connected = False
    fallback = RateLimiter()
    shared = RedisRateLimiter(fakeredis.FakeAsyncRedis(server=server), fallback)
    await shared.hit("user:api", 1)
    with pytest.raises(RateLimitedError):
        await shared.hit("user:api", 1)
    assert "user:api" in fallback._buckets
