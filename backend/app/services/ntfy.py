"""Phone push via ntfy (free, no account; Android and iOS apps subscribe to a secret topic)."""

from __future__ import annotations

import re
import secrets

import httpx

from app.config import get_settings
from app.logging import get_logger

log = get_logger(__name__)

TOPIC_RE = re.compile(r"^[A-Za-z0-9_-]{16,64}$")


def new_topic() -> str:
    return f"mailpilot-{secrets.token_urlsafe(18).replace('-', '').replace('_', '')[:24]}"


def subscribe_url(topic: str) -> str:
    return f"{get_settings().ntfy_server_url.rstrip('/')}/{topic}"


def _header(value: str) -> str:
    # HTTP headers must be latin-1; ntfy decodes RFC 2047 for anything else.
    try:
        value.encode("latin-1")
        return value
    except UnicodeEncodeError:
        import base64
        return f"=?UTF-8?B?{base64.b64encode(value.encode()).decode()}?="


async def send_ntfy(topic: str, *, title: str, body: str, click_url: str | None = None, priority: int = 5,
                    tags: str = "briefcase,tada") -> bool:
    if not TOPIC_RE.match(topic or ""):
        return False
    settings = get_settings()
    headers = {"Title": _header(title[:200]), "Priority": str(priority), "Tags": tags}
    if click_url:
        headers["Click"] = click_url
    token = settings.ntfy_access_token.get_secret_value()
    if token:
        headers["Authorization"] = f"Bearer {token}"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(subscribe_url(topic), content=body[:1000].encode(), headers=headers)
        resp.raise_for_status()
        return True
    except httpx.HTTPError as exc:
        log.warning("ntfy_send_failed", error=type(exc).__name__)
        return False
