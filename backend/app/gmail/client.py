"""Minimal async Gmail REST client with bounded retries and token refresh."""

from __future__ import annotations

import asyncio
import random
from collections.abc import Awaitable, Callable
from typing import Any

import httpx

from app.config import get_settings
from app.logging import get_logger

log = get_logger(__name__)

SCOPE_READONLY = "https://www.googleapis.com/auth/gmail.readonly"
SCOPE_SEND = "https://www.googleapis.com/auth/gmail.send"
SCOPE_MODIFY = "https://www.googleapis.com/auth/gmail.modify"
SCOPE_SETS: dict[str, list[str]] = {
    "readonly": [SCOPE_READONLY],
    "send": [SCOPE_READONLY, SCOPE_SEND],
    "modify": [SCOPE_READONLY, SCOPE_MODIFY],
    "full": [SCOPE_READONLY, SCOPE_SEND, SCOPE_MODIFY],
}

_RETRYABLE_STATUS = {429, 500, 502, 503, 504}
_RATE_LIMIT_REASONS = {"rateLimitExceeded", "userRateLimitExceeded", "backendError"}


class GmailError(Exception):
    def __init__(self, message: str, status: int | None = None, reason: str | None = None) -> None:
        super().__init__(message)
        self.status = status
        self.reason = reason

    def __str__(self) -> str:
        # Status and Google's error reason are safe to log and make failures diagnosable.
        detail = ", ".join(x for x in (f"HTTP {self.status}" if self.status else "", self.reason or "") if x)
        base = super().__str__()
        return f"{base} ({detail})" if detail else base


class GmailAuthError(GmailError):
    """Credentials are invalid or revoked; the user must reconnect."""


class GmailNotFoundError(GmailError):
    pass


class GmailHistoryExpiredError(GmailError):
    """The stored startHistoryId is too old; a full resync is required."""


class GmailRateLimitError(GmailError):
    pass


TokenProvider = Callable[[bool], Awaitable[str]]


def _error_reason(resp: httpx.Response) -> str | None:
    try:
        errors = resp.json().get("error", {}).get("errors", [])
        return errors[0].get("reason") if errors else None
    except ValueError:
        return None


class GmailClient:
    def __init__(
        self,
        token_provider: TokenProvider,
        *,
        http: httpx.AsyncClient | None = None,
        base_url: str | None = None,
        max_retries: int | None = None,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
    ) -> None:
        settings = get_settings()
        self._token_provider = token_provider
        self._http = http or httpx.AsyncClient(timeout=httpx.Timeout(30.0, connect=10.0))
        self._owns_http = http is None
        self._base = (base_url or settings.gmail_api_base).rstrip("/")
        self._max_retries = settings.gmail_max_retries if max_retries is None else max_retries
        self._sleep = sleep

    async def aclose(self) -> None:
        if self._owns_http:
            await self._http.aclose()

    async def __aenter__(self) -> GmailClient:
        return self

    async def __aexit__(self, *_: object) -> None:
        await self.aclose()

    async def _request(self, method: str, path: str, *, idempotent: bool = True, **kwargs: Any) -> dict[str, Any]:
        """``idempotent=False`` (sends) retries only failures where Gmail cannot have acted on the request:
        connection errors, 429 and quota 403s. Ambiguous failures (read timeouts, 5xx) are raised so the caller
        can check for the Message-ID before trying again, instead of risking a duplicate send."""
        url = f"{self._base}/users/me/{path.lstrip('/')}"
        refreshed = False
        attempt = 0
        while True:
            token = await self._token_provider(False)
            headers = {"Authorization": f"Bearer {token}"}
            try:
                resp = await self._http.request(method, url, headers=headers, **kwargs)
            except httpx.TransportError as exc:
                if not idempotent and not isinstance(exc, (httpx.ConnectError, httpx.ConnectTimeout)):
                    raise GmailError(f"Gmail transport error after request was sent: {type(exc).__name__}") from exc
                if attempt >= self._max_retries:
                    raise GmailError(f"Gmail transport error: {type(exc).__name__}") from exc
                await self._backoff(attempt, None)
                attempt += 1
                continue

            if resp.status_code < 300:
                return resp.json() if resp.content else {}
            reason = _error_reason(resp)
            if resp.status_code == 401:
                if refreshed:
                    raise GmailAuthError("Gmail rejected the access token", 401, reason)
                await self._token_provider(True)
                refreshed = True
                continue
            if resp.status_code == 404:
                raise GmailNotFoundError("Gmail resource not found", 404, reason)
            retryable = resp.status_code in _RETRYABLE_STATUS or (
                resp.status_code == 403 and reason in _RATE_LIMIT_REASONS
            )
            if not idempotent and (resp.status_code >= 500 or reason == "backendError"):
                raise GmailError(f"Gmail API error {resp.status_code}", resp.status_code, reason)
            if retryable and attempt < self._max_retries:
                await self._backoff(attempt, resp.headers.get("retry-after"))
                attempt += 1
                continue
            if retryable:
                raise GmailRateLimitError("Gmail rate limit or server error persisted", resp.status_code, reason)
            if resp.status_code == 403 and reason in {"insufficientPermissions", "forbidden"}:
                raise GmailAuthError("Missing Gmail permission for this operation", 403, reason)
            raise GmailError(f"Gmail API error {resp.status_code}", resp.status_code, reason)

    async def _backoff(self, attempt: int, retry_after: str | None) -> None:
        delay = min(32.0, (2**attempt) + random.uniform(0, 1))
        if retry_after:
            try:
                delay = max(delay, min(60.0, float(retry_after)))
            except ValueError:
                pass
        log.info("gmail_backoff", attempt=attempt, delay=round(delay, 2))
        await self._sleep(delay)

    # --- API surface -------------------------------------------------------
    async def get_profile(self) -> dict[str, Any]:
        return await self._request("GET", "profile")

    async def list_messages(
        self, *, query: str | None = None, page_token: str | None = None, max_results: int = 100,
        include_spam_trash: bool = False,
    ) -> dict[str, Any]:
        params: dict[str, Any] = {"maxResults": max_results, "includeSpamTrash": str(include_spam_trash).lower()}
        if query:
            params["q"] = query
        if page_token:
            params["pageToken"] = page_token
        return await self._request("GET", "messages", params=params)

    async def get_message(self, message_id: str, fmt: str = "full") -> dict[str, Any]:
        return await self._request("GET", f"messages/{message_id}", params={"format": fmt})

    async def list_history(self, start_history_id: str, page_token: str | None = None) -> dict[str, Any]:
        params: dict[str, Any] = {
            "startHistoryId": start_history_id,
            "maxResults": 500,
            "historyTypes": ["messageAdded", "messageDeleted", "labelAdded", "labelRemoved"],
        }
        if page_token:
            params["pageToken"] = page_token
        try:
            return await self._request("GET", "history", params=params)
        except GmailNotFoundError as exc:
            raise GmailHistoryExpiredError("History ID expired", 404) from exc

    async def get_attachment(self, message_id: str, attachment_id: str) -> dict[str, Any]:
        return await self._request("GET", f"messages/{message_id}/attachments/{attachment_id}")

    async def list_labels(self) -> dict[str, Any]:
        return await self._request("GET", "labels")

    async def create_label(self, name: str) -> dict[str, Any]:
        body = {"name": name, "labelListVisibility": "labelShow", "messageListVisibility": "show"}
        return await self._request("POST", "labels", json=body)

    async def modify_message(
        self, message_id: str, add: list[str] | None = None, remove: list[str] | None = None
    ) -> dict[str, Any]:
        body = {"addLabelIds": add or [], "removeLabelIds": remove or []}
        return await self._request("POST", f"messages/{message_id}/modify", json=body)

    async def modify_thread(
        self, thread_id: str, add: list[str] | None = None, remove: list[str] | None = None
    ) -> dict[str, Any]:
        body = {"addLabelIds": add or [], "removeLabelIds": remove or []}
        return await self._request("POST", f"threads/{thread_id}/modify", json=body)

    async def send_raw(self, raw_b64url: str, thread_id: str | None) -> dict[str, Any]:
        body: dict[str, Any] = {"raw": raw_b64url}
        if thread_id:
            body["threadId"] = thread_id
        return await self._request("POST", "messages/send", idempotent=False, json=body)

    async def find_by_rfc822_id(self, rfc822_id: str) -> str | None:
        """Return the Gmail ID of a message with this Message-ID header, if it exists."""
        clean = rfc822_id.strip().strip("<>")
        result = await self.list_messages(query=f"rfc822msgid:{clean}", max_results=1, include_spam_trash=True)
        messages = result.get("messages") or []
        return messages[0]["id"] if messages else None
