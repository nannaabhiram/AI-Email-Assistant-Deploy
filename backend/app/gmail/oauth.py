"""Google OAuth 2.0 (authorization code + PKCE) for Gmail, and token management."""

from __future__ import annotations

import base64
import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import urlencode
from uuid import UUID

import httpx
from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db.models import (
    AccountStatus,
    ConnectedAccount,
    OAuthCredential,
    OAuthState,
    SyncState,
)
from app.db.session import system_session
from app.errors import AppError, NotConfiguredError, NotFoundError
from app.gmail.client import SCOPE_READONLY, SCOPE_SETS, GmailAuthError, GmailClient
from app.logging import get_logger
from app.security.crypto import decrypt, encrypt, sha256_hex
from app.services.audit import record_audit

log = get_logger(__name__)
STATE_TTL = timedelta(minutes=10)
_ALLOWED_REDIRECT_PREFIXES = ("/settings", "/onboarding", "/dashboard")


class OAuthCallbackError(AppError):
    code = "oauth_callback_failed"


def _pkce_pair() -> tuple[str, str]:
    verifier = secrets.token_urlsafe(64)[:96]
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    return verifier, challenge


def _require_configured() -> None:
    if not get_settings().gmail_configured:
        raise NotConfiguredError(
            "Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
            code="gmail_not_configured",
        )


async def build_authorization_url(
    session: AsyncSession, user_id: UUID, scope_set: str = "readonly", redirect_path: str = "/settings/accounts",
    login_hint: str | None = None,
) -> str:
    _require_configured()
    settings = get_settings()
    scopes = SCOPE_SETS.get(scope_set)
    if scopes is None:
        raise AppError("Unknown permission set", code="invalid_scope_set")
    if not redirect_path.startswith(_ALLOWED_REDIRECT_PREFIXES):
        redirect_path = "/settings/accounts"
    state = secrets.token_urlsafe(32)
    verifier, challenge = _pkce_pair()
    session.add(
        OAuthState(
            state_hash=sha256_hex(state),
            user_id=user_id,
            encrypted_code_verifier=encrypt(verifier),
            requested_scopes=scopes,
            redirect_path=redirect_path,
            expires_at=datetime.now(UTC) + STATE_TTL,
        )
    )
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": settings.google_redirect_uri,
        "response_type": "code",
        "scope": " ".join(scopes),
        "access_type": "offline",
        "include_granted_scopes": "true",
        "prompt": "consent",
        "state": state,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
    }
    if login_hint:
        params["login_hint"] = login_hint
    return f"{settings.google_oauth_auth_url}?{urlencode(params)}"


async def _token_request(data: dict[str, str], http: httpx.AsyncClient | None = None) -> dict[str, Any]:
    settings = get_settings()
    payload = {
        "client_id": settings.google_client_id,
        "client_secret": settings.google_client_secret.get_secret_value(),
        **data,
    }
    client = http or httpx.AsyncClient(timeout=15.0)
    try:
        resp = await client.post(settings.google_oauth_token_url, data=payload)
    finally:
        if http is None:
            await client.aclose()
    body = resp.json() if resp.content else {}
    if resp.status_code >= 400:
        error = body.get("error", "token_error")
        if error in {"invalid_grant", "unauthorized_client"}:
            raise GmailAuthError(f"Google rejected the grant: {error}", resp.status_code, error)
        raise OAuthCallbackError(f"Google token endpoint error: {error}")
    return body


async def handle_callback(code: str, state: str, http: httpx.AsyncClient | None = None) -> tuple[UUID, str]:
    """Validate state, exchange the code, store encrypted tokens. Returns (account_id, redirect_path)."""
    _require_configured()
    state_hash = sha256_hex(state)
    async with system_session() as session:
        row = (
            await session.execute(select(OAuthState).where(OAuthState.state_hash == state_hash).with_for_update())
        ).scalar_one_or_none()
        if row is None or row.consumed_at is not None or row.expires_at < datetime.now(UTC):
            raise OAuthCallbackError("OAuth state is invalid, expired or already used", code="invalid_oauth_state")
        row.consumed_at = datetime.now(UTC)
        user_id, verifier, redirect_path = row.user_id, decrypt(row.encrypted_code_verifier), row.redirect_path

    tokens = await _token_request(
        {
            "grant_type": "authorization_code",
            "code": code,
            "code_verifier": verifier,
            "redirect_uri": get_settings().google_redirect_uri,
        },
        http,
    )
    granted = sorted(set((tokens.get("scope") or "").split()))
    if SCOPE_READONLY not in granted:
        raise OAuthCallbackError("Gmail read permission was not granted", code="scope_not_granted")
    access_token = tokens["access_token"]
    expires_at = datetime.now(UTC) + timedelta(seconds=int(tokens.get("expires_in", 3600)) - 60)

    async def _static_token(_: bool) -> str:
        return access_token

    async with GmailClient(_static_token, http=http) as gmail:
        profile = await gmail.get_profile()
    email_address = profile["emailAddress"].lower()

    async with system_session() as session:
        stmt = (
            pg_insert(ConnectedAccount)
            .values(user_id=user_id, provider="gmail", email_address=email_address, status="active",
                    granted_scopes=granted, last_error=None)
            .on_conflict_do_update(
                index_elements=["user_id", "provider", "email_address"],
                set_={"status": "active", "granted_scopes": granted, "last_error": None},
            )
            .returning(ConnectedAccount.id)
        )
        account_id: UUID = (await session.execute(stmt)).scalar_one()
        existing = await session.get(OAuthCredential, account_id)
        refresh_token = tokens.get("refresh_token")
        if refresh_token is None and existing is None:
            raise OAuthCallbackError(
                "Google did not return a refresh token. Remove the app's access in your Google account and retry.",
                code="missing_refresh_token",
            )
        if existing is None:
            session.add(
                OAuthCredential(
                    account_id=account_id, user_id=user_id, encrypted_refresh_token=encrypt(refresh_token or ""),
                    encrypted_access_token=encrypt(access_token), access_token_expires_at=expires_at,
                )
            )
        else:
            if refresh_token:
                existing.encrypted_refresh_token = encrypt(refresh_token)
            existing.encrypted_access_token = encrypt(access_token)
            existing.access_token_expires_at = expires_at
        await session.execute(
            pg_insert(SyncState).values(account_id=account_id, user_id=user_id).on_conflict_do_nothing()
        )
        record_audit(session, user_id=user_id, event="gmail.connected", entity_type="connected_account",
                     entity_id=account_id, details={"email": email_address, "scopes": granted})
        from app.jobs.queue import enqueue  # local import to avoid a cycle

        await enqueue(session, "gmail_sync", {"account_id": str(account_id), "mode": "auto"}, user_id=user_id,
                      dedupe_key=f"sync:{account_id}", priority=10)
    return account_id, redirect_path


class TokenManager:
    """Supplies valid access tokens for one connected account, refreshing as needed."""

    def __init__(self, account_id: UUID, http: httpx.AsyncClient | None = None) -> None:
        self.account_id = account_id
        self._http = http
        self._cached: tuple[str, datetime] | None = None

    async def __call__(self, force_refresh: bool) -> str:
        now = datetime.now(UTC)
        if not force_refresh and self._cached and self._cached[1] > now + timedelta(seconds=30):
            return self._cached[0]
        async with system_session() as session:
            cred = await session.get(OAuthCredential, self.account_id, with_for_update=True)
            if cred is None:
                raise GmailAuthError("No stored credentials for this account")
            if (
                not force_refresh
                and cred.encrypted_access_token
                and cred.access_token_expires_at
                and cred.access_token_expires_at > now + timedelta(seconds=30)
            ):
                token = decrypt(cred.encrypted_access_token)
                self._cached = (token, cred.access_token_expires_at)
                return token
            try:
                tokens = await _token_request(
                    {"grant_type": "refresh_token", "refresh_token": decrypt(cred.encrypted_refresh_token)},
                    self._http,
                )
            except GmailAuthError:
                await session.execute(
                    update(ConnectedAccount)
                    .where(ConnectedAccount.id == self.account_id)
                    .values(status=AccountStatus.needs_reauth, last_error="Google access was revoked or expired")
                )
                await session.commit()
                raise
            token = tokens["access_token"]
            expires_at = now + timedelta(seconds=int(tokens.get("expires_in", 3600)) - 60)
            cred.encrypted_access_token = encrypt(token)
            cred.access_token_expires_at = expires_at
            if tokens.get("refresh_token"):
                cred.encrypted_refresh_token = encrypt(tokens["refresh_token"])
            self._cached = (token, expires_at)
            return token


async def gmail_client_for(account_id: UUID, http: httpx.AsyncClient | None = None) -> GmailClient:
    return GmailClient(TokenManager(account_id, http), http=http)


async def revoke_and_disconnect(user_id: UUID, account_id: UUID, delete_data: bool) -> None:
    """Revoke Google access (best effort), delete stored tokens, and optionally delete synced data."""
    async with system_session() as session:
        account = await session.get(ConnectedAccount, account_id)
        if account is None or account.user_id != user_id:
            raise NotFoundError("Connected account not found")
        cred = await session.get(OAuthCredential, account_id)
        refresh_token = decrypt(cred.encrypted_refresh_token) if cred else None
        # Google revokes the whole grant (this app + this Gmail user), not just one token. If the same
        # mailbox is still connected elsewhere (e.g. moved from another MailPilot user), revoking here
        # would silently break that connection, so only forget our copy of the tokens.
        shared = (await session.execute(
            select(ConnectedAccount.id).where(
                ConnectedAccount.id != account_id, ConnectedAccount.provider == account.provider,
                ConnectedAccount.email_address == account.email_address,
                ConnectedAccount.status.in_([AccountStatus.active, AccountStatus.needs_reauth]),
            ).limit(1)
        )).scalar_one_or_none() is not None

    revoked = False
    if refresh_token and get_settings().gmail_configured and not shared:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(get_settings().google_oauth_revoke_url, data={"token": refresh_token})
                revoked = resp.status_code == 200
        except httpx.HTTPError:
            log.warning("gmail_revoke_failed", account_id=str(account_id))

    async with system_session() as session:
        if delete_data:
            account = await session.get(ConnectedAccount, account_id)
            if account is not None:
                await session.delete(account)
        else:
            await session.execute(
                update(ConnectedAccount)
                .where(ConnectedAccount.id == account_id, ConnectedAccount.user_id == user_id)
                .values(status=AccountStatus.disconnected, granted_scopes=[], last_error=None)
            )
            cred = await session.get(OAuthCredential, account_id)
            if cred is not None:
                await session.delete(cred)
        record_audit(session, user_id=user_id if not delete_data else user_id, event="gmail.disconnected",
                     entity_type="connected_account", entity_id=account_id,
                     details={"revoked_at_google": revoked, "revocation_skipped_shared_grant": shared,
                              "data_deleted": delete_data})
