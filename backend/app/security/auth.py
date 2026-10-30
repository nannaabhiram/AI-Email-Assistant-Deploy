"""Supabase access-token verification.

The user's identity is derived only from a verified JWT (``sub`` claim). Tokens are
verified against the project's JWKS (asymmetric signing keys, ES256/RS256) and, for
legacy projects, the shared HS256 secret. Request fields are never trusted for identity.
"""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass
from typing import Any
from uuid import UUID

import httpx
import jwt
from fastapi import Request

from app.config import Settings, get_settings
from app.errors import UnauthorizedError
from app.logging import user_id_var

_ASYMMETRIC_ALGS = ["ES256", "RS256", "EdDSA"]


@dataclass(frozen=True, slots=True)
class CurrentUser:
    id: UUID
    email: str | None
    claims: dict[str, Any]

    @property
    def is_demo(self) -> bool:
        """Seeded sample-data account. app_metadata is writable only server-side, so it is trustworthy."""
        meta = self.claims.get("app_metadata")
        return isinstance(meta, dict) and meta.get("demo") is True


class JWKSCache:
    """JWKS keys cached for ``ttl``. Unknown ``kid`` values (key rotation) trigger at most one fetch per
    ``min_refresh_interval``, so forged tokens with random kids cannot turn every request into a JWKS fetch."""

    def __init__(self, ttl_seconds: int = 600, min_refresh_interval: float = 30.0) -> None:
        self._ttl = ttl_seconds
        self._min_refresh_interval = min_refresh_interval
        self._keys: dict[str, Any] = {}
        self._fetched_at = 0.0
        self._attempted_at = float("-inf")
        self._lock = asyncio.Lock()

    async def get_key(self, settings: Settings, kid: str) -> Any:
        if kid not in self._keys or time.monotonic() - self._fetched_at > self._ttl:
            async with self._lock:
                stale = time.monotonic() - self._fetched_at > self._ttl
                throttled = time.monotonic() - self._attempted_at < self._min_refresh_interval
                if (stale or kid not in self._keys) and not throttled:
                    self._attempted_at = time.monotonic()
                    await self._refresh(settings)
        key = self._keys.get(kid)
        if key is None:
            raise UnauthorizedError("Unknown token signing key", code="invalid_token")
        return key

    async def _refresh(self, settings: Settings) -> None:
        url = settings.supabase_url.rstrip("/") + "/auth/v1/.well-known/jwks.json"
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(url)
                resp.raise_for_status()
                data = resp.json()
        except httpx.HTTPError as exc:
            raise UnauthorizedError("Unable to load token signing keys", code="jwks_unavailable") from exc
        keys: dict[str, Any] = {}
        for jwk in data.get("keys", []):
            if kid := jwk.get("kid"):
                keys[kid] = jwt.PyJWK(jwk).key
        self._keys = keys
        self._fetched_at = time.monotonic()


_jwks_cache = JWKSCache()


async def verify_access_token(token: str, settings: Settings | None = None) -> CurrentUser:
    settings = settings or get_settings()
    try:
        header = jwt.get_unverified_header(token)
    except jwt.PyJWTError as exc:
        raise UnauthorizedError("Malformed access token", code="invalid_token") from exc

    alg = header.get("alg")
    issuer = settings.supabase_url.rstrip("/") + "/auth/v1"
    options: Any = {"require": ["exp", "sub", "aud"]}
    try:
        if alg == "HS256":
            secret = settings.supabase_jwt_secret.get_secret_value()
            if not secret:
                raise UnauthorizedError("HS256 tokens are not accepted by this server", code="invalid_token")
            claims = jwt.decode(
                token, secret, algorithms=["HS256"], audience=settings.supabase_jwt_audience, issuer=issuer,
                options=options,
            )
        elif alg in _ASYMMETRIC_ALGS:
            key = await _jwks_cache.get_key(settings, header.get("kid", ""))
            claims = jwt.decode(
                token,
                key,
                algorithms=[alg],
                audience=settings.supabase_jwt_audience,
                issuer=issuer,
                options=options,
            )
        else:
            raise UnauthorizedError("Unsupported token algorithm", code="invalid_token")
    except jwt.ExpiredSignatureError as exc:
        raise UnauthorizedError("Access token expired", code="token_expired") from exc
    except jwt.PyJWTError as exc:
        raise UnauthorizedError("Invalid access token", code="invalid_token") from exc

    if claims.get("role") != "authenticated":
        raise UnauthorizedError("Token is not a user session", code="invalid_token")
    try:
        user_id = UUID(str(claims["sub"]))
    except (KeyError, ValueError) as exc:
        raise UnauthorizedError("Token subject is invalid", code="invalid_token") from exc
    return CurrentUser(id=user_id, email=claims.get("email"), claims=claims)


async def get_current_user(request: Request) -> CurrentUser:
    auth = request.headers.get("authorization", "")
    scheme, _, token = auth.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise UnauthorizedError("Missing bearer token")
    user = await verify_access_token(token.strip())
    user_id_var.set(str(user.id))
    request.state.user = user
    return user
