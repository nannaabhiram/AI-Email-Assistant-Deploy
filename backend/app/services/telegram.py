"""Phone alerts through a Telegram bot (free, Android + iOS, no shared-IP quotas)."""

from __future__ import annotations

import hashlib
import hmac
import html
from typing import Any

import httpx

from app.config import get_settings
from app.logging import get_logger

log = get_logger(__name__)
WEBHOOK_PATH = "/api/v1/telegram/webhook"


class TelegramError(Exception):
    """Telegram refused or could not be reached; message is safe to show the user."""


def configured() -> bool:
    return bool(get_settings().telegram_bot_token.get_secret_value())


def webhook_secret() -> str:
    token = get_settings().telegram_bot_token.get_secret_value()
    return hmac.new(token.encode(), b"mailpilot-telegram-webhook", hashlib.sha256).hexdigest()


async def _call(method: str, payload: dict[str, Any]) -> dict[str, Any]:
    token = get_settings().telegram_bot_token.get_secret_value()
    if not token:
        raise TelegramError("Telegram bot is not configured on the server (TELEGRAM_BOT_TOKEN)")
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(15.0, connect=10.0)) as client:
            resp = await client.post(f"https://api.telegram.org/bot{token}/{method}", json=payload)
        data: dict[str, Any] = resp.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise TelegramError(f"Telegram unreachable ({type(exc).__name__})") from exc
    if not data.get("ok"):
        raise TelegramError(f"Telegram: {str(data.get('description') or resp.status_code)[:200]}")
    return data


async def bot_username() -> str:
    username = get_settings().telegram_bot_username.strip().lstrip("@")
    if username:
        return username
    return str((await _call("getMe", {}))["result"]["username"])


async def ensure_webhook() -> None:
    url = get_settings().api_base_url.rstrip("/") + WEBHOOK_PATH
    await _call("setWebhook", {"url": url, "secret_token": webhook_secret(), "allowed_updates": ["message"],
                               "drop_pending_updates": False})


async def send_message(chat_id: int | str, *, title: str, body: str = "", url: str | None = None) -> None:
    text = f"<b>{html.escape(title[:200])}</b>" + (f"\n{html.escape(body[:1000])}" if body else "")
    payload: dict[str, Any] = {"chat_id": chat_id, "text": text, "parse_mode": "HTML",
                               "disable_web_page_preview": True}
    if url and url.startswith("https://"):
        payload["reply_markup"] = {"inline_keyboard": [[{"text": "Open in MailPilot", "url": url}]]}
    await _call("sendMessage", payload)


async def send_alert(chat_id: int | str, *, title: str, body: str = "", url: str | None = None) -> bool:
    try:
        await send_message(chat_id, title=title, body=body, url=url)
        return True
    except TelegramError as exc:
        log.warning("telegram_send_failed", detail=str(exc))
        return False
