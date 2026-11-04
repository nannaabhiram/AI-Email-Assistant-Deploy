"""Phone push via ntfy (free, no account; Android and iOS apps subscribe to a secret topic)."""

from __future__ import annotations

import asyncio
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


class NtfyError(Exception):
    """Push service refused or could not be reached; message is safe to show the user."""


async def publish(topic: str, *, title: str, body: str, click_url: str | None = None, priority: int = 5,
                  tags: str = "briefcase,tada") -> None:
    if not TOPIC_RE.match(topic or ""):
        raise NtfyError("Invalid phone-alert topic; turn alerts off and on again")
    settings = get_settings()
    headers = {"Title": _header(title[:200]), "Priority": str(priority), "Tags": tags,
               "User-Agent": "MailPilot/1.0"}
    if click_url and click_url.startswith(("http://", "https://")):
        headers["Click"] = click_url
    token = settings.ntfy_access_token.get_secret_value()
    if token:
        headers["Authorization"] = f"Bearer {token}"
    last = "unknown error"
    for attempt in range(3):
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(15.0, connect=10.0)) as client:
                resp = await client.post(subscribe_url(topic), content=body[:1000].encode(), headers=headers)
        except httpx.HTTPError as exc:
            last = f"{type(exc).__name__}: {exc}"[:200]
        else:
            if resp.status_code < 300:
                return
            last = f"HTTP {resp.status_code}: {resp.text.strip()[:200]}"
            if resp.status_code not in {429, 500, 502, 503, 504}:
                break
        await asyncio.sleep(1.5 * (attempt + 1))
    log.warning("ntfy_send_failed", detail=last)
    raise NtfyError(f"ntfy.sh: {last}")


async def send_ntfy(topic: str, *, title: str, body: str, click_url: str | None = None, priority: int = 5,
                    tags: str = "briefcase,tada") -> bool:
    try:
        await publish(topic, title=title, body=body, click_url=click_url, priority=priority, tags=tags)
        return True
    except NtfyError:
        return False
