import time
import uuid

import httpx
import jwt
import pytest
import respx
from cryptography.hazmat.primitives.asymmetric import ec

from app.config import get_settings
from app.errors import UnauthorizedError
from app.gmail.client import GmailAuthError, GmailClient, GmailHistoryExpiredError, GmailRateLimitError
from app.security import auth as auth_module
from app.security.auth import verify_access_token
from tests.conftest import make_token

BASE = "https://gmail.test/gmail/v1/users/me"


async def _no_sleep(_: float) -> None:
    return None


def _client(tokens: list[str] | None = None, retries: int = 3) -> tuple[GmailClient, list[bool]]:
    refreshes: list[bool] = []
    tokens = tokens or ["t1", "t2"]

    async def provider(force: bool) -> str:
        if force:
            refreshes.append(True)
        return tokens[min(len(refreshes), len(tokens) - 1)]

    return GmailClient(provider, http=httpx.AsyncClient(), base_url="https://gmail.test/gmail/v1",
                       max_retries=retries, sleep=_no_sleep), refreshes


@respx.mock
async def test_rate_limit_is_retried_with_backoff() -> None:
    route = respx.get(f"{BASE}/profile").mock(side_effect=[
        httpx.Response(429, headers={"retry-after": "1"}, json={"error": {"errors": [{"reason": "rateLimitExceeded"}]}}),
        httpx.Response(403, json={"error": {"errors": [{"reason": "userRateLimitExceeded"}]}}),
        httpx.Response(200, json={"emailAddress": "a@b.c", "historyId": "1"}),
    ])
    client, _ = _client()
    assert (await client.get_profile())["historyId"] == "1"
    assert route.call_count == 3


@respx.mock
async def test_rate_limit_gives_up_after_bounded_retries() -> None:
    respx.get(f"{BASE}/profile").mock(return_value=httpx.Response(503))
    client, _ = _client(retries=2)
    with pytest.raises(GmailRateLimitError) as info:
        await client.get_profile()
    assert str(info.value) == "Gmail rate limit or server error persisted (HTTP 503)"


@respx.mock
async def test_sync_job_waits_minutes_after_persistent_rate_limit(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.jobs import handlers

    async def limited(*_: object, **__: object) -> None:
        raise GmailRateLimitError("Gmail rate limit or server error persisted", 429, "rateLimitExceeded")

    monkeypatch.setattr(handlers, "sync_account", limited)
    with pytest.raises(handlers.RetryAfter) as info:
        await handlers.handle_gmail_sync({"account_id": str(uuid.uuid4())})
    assert info.value.seconds >= 300 and "HTTP 429, rateLimitExceeded" in str(info.value)


@respx.mock
async def test_401_triggers_single_token_refresh() -> None:
    route = respx.get(f"{BASE}/profile").mock(side_effect=[httpx.Response(401), httpx.Response(200, json={"x": 1})])
    client, refreshes = _client()
    assert await client.get_profile() == {"x": 1}
    assert refreshes == [True]
    assert route.calls[1].request.headers["Authorization"] == "Bearer t2"


@respx.mock
async def test_repeated_401_raises_auth_error() -> None:
    respx.get(f"{BASE}/profile").mock(return_value=httpx.Response(401))
    client, _ = _client()
    with pytest.raises(GmailAuthError):
        await client.get_profile()


@respx.mock
async def test_expired_history_raises_specific_error() -> None:
    respx.get(f"{BASE}/history").mock(return_value=httpx.Response(404, json={"error": {}}))
    client, _ = _client()
    with pytest.raises(GmailHistoryExpiredError):
        await client.list_history("123")


@respx.mock
async def test_pagination_parameters() -> None:
    route = respx.get(f"{BASE}/messages").mock(return_value=httpx.Response(200, json={"messages": []}))
    client, _ = _client()
    await client.list_messages(query="newer_than:30d", page_token="abc", max_results=50)
    params = route.calls[0].request.url.params
    assert params["q"] == "newer_than:30d" and params["pageToken"] == "abc" and params["maxResults"] == "50"


# --- Supabase JWT verification ----------------------------------------------------------
async def test_hs256_token_accepted() -> None:
    uid = uuid.uuid4()
    user = await verify_access_token(make_token(uid))
    assert user.id == uid


@pytest.mark.parametrize("kwargs,code", [
    ({"expires_in": -10}, "token_expired"),
    ({"role": "anon"}, "invalid_token"),
    ({"aud": "other"}, "invalid_token"),
])
async def test_bad_tokens_rejected(kwargs: dict, code: str) -> None:
    with pytest.raises(UnauthorizedError) as exc:
        await verify_access_token(make_token(uuid.uuid4(), **kwargs))
    assert exc.value.code == code


async def test_tampered_signature_rejected() -> None:
    token = make_token(uuid.uuid4())
    forged = jwt.encode(jwt.decode(token, options={"verify_signature": False}), "x" * 40, algorithm="HS256")
    with pytest.raises(UnauthorizedError):
        await verify_access_token(forged)


@respx.mock
async def test_es256_token_verified_against_jwks() -> None:
    key = ec.generate_private_key(ec.SECP256R1())
    jwk = jwt.algorithms.ECAlgorithm.to_jwk(key.public_key(), as_dict=True)
    jwk.update(kid="test-kid", alg="ES256")
    settings = get_settings()
    respx.get(settings.supabase_url + "/auth/v1/.well-known/jwks.json").mock(return_value=httpx.Response(200, json={"keys": [jwk]}))
    auth_module._jwks_cache = auth_module.JWKSCache()
    uid = uuid.uuid4()
    now = int(time.time())
    token = jwt.encode({"sub": str(uid), "role": "authenticated", "aud": "authenticated", "exp": now + 60, "iat": now,
                        "iss": settings.supabase_url + "/auth/v1"}, key, algorithm="ES256", headers={"kid": "test-kid"})
    assert (await verify_access_token(token)).id == uid
    bad_iss = jwt.encode({"sub": str(uid), "role": "authenticated", "aud": "authenticated", "exp": now + 60,
                          "iss": "https://evil.example/auth/v1"}, key, algorithm="ES256", headers={"kid": "test-kid"})
    with pytest.raises(UnauthorizedError):
        await verify_access_token(bad_iss)
