"""Phone alerts through each user's own Telegram bot (free, Android + iOS, no shared quotas)."""

from __future__ import annotations

import html
import re
from typing import Any

import httpx

from app.logging import get_logger
from app.security.crypto import decrypt

log = get_logger(__name__)
TOKEN_RE = re.compile(r"^\d{5,15}:[A-Za-z0-9_-]{30,64}$")
TOKEN_KEY, BOT_KEY, CHAT_KEY, CODE_KEY = "telegram_bot_token_enc", "telegram_bot", "telegram_chat_id", "telegram_link_code"
HOOK_SECRET_KEY, HOOK_URL_KEY, STATE_KEY = "telegram_webhook_secret", "telegram_webhook_url", "telegram_state"
SECRET_KEYS = frozenset({TOKEN_KEY, CODE_KEY, HOOK_SECRET_KEY, HOOK_URL_KEY, STATE_KEY})


class TelegramError(Exception):
    """Telegram refused or could not be reached; message is safe to show the user."""


async def call(token: str, method: str, payload: dict[str, Any] | None = None) -> Any:
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(15.0, connect=10.0)) as client:
            resp = await client.post(f"https://api.telegram.org/bot{token}/{method}", json=payload or {})
        data: dict[str, Any] = resp.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise TelegramError(f"Telegram unreachable ({type(exc).__name__})") from exc
    if not data.get("ok"):
        desc = str(data.get("description") or resp.status_code)
        if resp.status_code == 401:
            desc = "bot token rejected; copy it again from @BotFather"
        raise TelegramError(f"Telegram: {desc[:200]}")
    return data.get("result")


def token_from(prefs: dict[str, Any]) -> str | None:
    enc = prefs.get(TOKEN_KEY)
    return decrypt(enc) if enc else None


async def send_message(token: str, chat_id: int | str, *, title: str, body: str = "", url: str | None = None) -> None:
    text = f"<b>{html.escape(title[:200])}</b>" + (f"\n{html.escape(body[:1000])}" if body else "")
    payload: dict[str, Any] = {"chat_id": chat_id, "text": text, "parse_mode": "HTML",
                               "disable_web_page_preview": True}
    if url and url.startswith("https://"):
        payload["reply_markup"] = {"inline_keyboard": [[{"text": "Open in MailPilot", "url": url}]]}
    await call(token, "sendMessage", payload)


async def find_start_chat(token: str, code: str) -> int | None:
    updates = await call(token, "getUpdates", {"allowed_updates": ["message"], "limit": 100})
    for upd in reversed(updates or []):
        msg = upd.get("message") or {}
        if (msg.get("chat") or {}).get("type") == "private" and str(msg.get("text") or "").strip() == f"/start {code}":
            return int(msg["chat"]["id"])
    return None


async def send_alert(prefs: dict[str, Any], *, title: str, body: str = "", url: str | None = None) -> bool:
    chat_id = prefs.get(CHAT_KEY)
    if not chat_id or not prefs.get(TOKEN_KEY):
        return False
    try:
        token = token_from(prefs)
        assert token
        await send_message(token, chat_id, title=title, body=body, url=url)
        return True
    except Exception as exc:
        log.warning("telegram_send_failed", detail=str(exc)[:200])
        return False


Buttons = list[list[dict[str, str]]]


def _payload(chat_id: int | str, text: str, buttons: Buttons | None) -> dict[str, Any]:
    payload: dict[str, Any] = {"chat_id": chat_id, "text": text[:4096], "parse_mode": "HTML",
                               "disable_web_page_preview": True}
    if buttons:
        payload["reply_markup"] = {"inline_keyboard": buttons}
    return payload


async def send_html(token: str, chat_id: int | str, text: str, buttons: Buttons | None = None) -> int | None:
    result = await call(token, "sendMessage", _payload(chat_id, text, buttons))
    return int(result["message_id"]) if isinstance(result, dict) and "message_id" in result else None


async def edit_html(token: str, chat_id: int | str, message_id: int, text: str, buttons: Buttons | None = None) -> None:
    payload = {**_payload(chat_id, text, buttons), "message_id": message_id}
    if not buttons:
        payload["reply_markup"] = {"inline_keyboard": []}
    try:
        await call(token, "editMessageText", payload)
    except TelegramError as exc:
        if "message is not modified" not in str(exc):
            raise


async def answer_callback(token: str, callback_id: str, text: str | None = None) -> None:
    try:
        await call(token, "answerCallbackQuery", {"callback_query_id": callback_id, **({"text": text[:190]} if text else {})})
    except TelegramError:
        pass  # cosmetic only (spinner on the button)


async def typing(token: str, chat_id: int | str) -> None:
    try:
        await call(token, "sendChatAction", {"chat_id": chat_id, "action": "typing"})
    except TelegramError:
        pass
