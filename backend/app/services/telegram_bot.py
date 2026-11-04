"""Telegram mail assistant on each user's own bot.

The owner chats with their bot in plain words: "show me the mail from Infosys" finds and explains the email;
"send mail to rahul saying I will come at 5" becomes a professional draft preview with Approve / Rewrite /
Delete buttons. Approve sends through the same compose path as the website (short undo window).
Updates arrive by webhook (one per user's bot, authenticated with a per-user secret) and run in the worker.
"""

from __future__ import annotations

import html
import json
import re
import secrets
import time
from datetime import datetime
from typing import Any
from uuid import UUID
from zoneinfo import ZoneInfo

from sqlalchemy import select, text

from app.actions import compose
from app.actions.engine import PermissionUpgradeRequired
from app.analysis.search import natural_language_search
from app.config import get_settings
from app.db.models import EmailAnalysis, EmailMessage, UserSettings
from app.db.session import system_session, user_session
from app.errors import AppError, NotConfiguredError
from app.llm.base import LLMError
from app.llm.prompts import ASSISTANT_SYSTEM
from app.llm.schemas import AssistantIntentOutput
from app.llm.service import get_llm_service
from app.logging import get_logger
from app.services import telegram as tg
from app.services.writing import polish

log = get_logger(__name__)
EMAIL_RE = re.compile(r"[\w.+'-]+@[\w-]+(?:\.[\w-]+)+")
MAX_DRAFTS = 5
UNDO_SECONDS = 10

HELP = (
    "<b>MailPilot assistant</b>\n"
    "Just type what you want, in your own words:\n\n"
    "🔎 <i>show me the mail from Infosys</i>\n"
    "🔎 <i>any mail about my internship offer?</i>\n"
    "✉️ <i>send mail to rahul@gmail.com saying i will come tomorrow 10am for interview</i>\n"
    "↩️ After opening a mail: <i>reply that I accept and can join on Monday</i>\n\n"
    "I turn your words into a professional email and show a preview. Nothing is sent until you tap "
    "<b>Approve</b>. /help shows this again."
)


# --- State (kept in user_settings.notification_prefs.telegram_state) ------------------------------
async def _load(user_id: UUID) -> tuple[dict[str, Any], str | None]:
    async with system_session() as s:
        us = await s.get(UserSettings, user_id)
    prefs = (us.notification_prefs if us else None) or {}
    try:
        return prefs, tg.token_from(prefs)
    except NotConfiguredError:  # saved under another TOKEN_ENCRYPTION_KEY: the user must paste the token again
        await _forget_bot(user_id)
        return prefs, None


async def _forget_bot(user_id: UUID) -> None:
    async with system_session() as s:
        await s.execute(text(
            "update public.user_settings set notification_prefs = notification_prefs - cast(:keys as text[]) "
            "where user_id = :uid"),
            {"keys": [tg.TOKEN_KEY, tg.CHAT_KEY, tg.CODE_KEY, tg.HOOK_URL_KEY, tg.HOOK_SECRET_KEY, tg.STATE_KEY],
             "uid": user_id})
    log.warning("telegram_token_unreadable_cleared", user_id=str(user_id))


async def _save_state(user_id: UUID, state: dict[str, Any]) -> None:
    async with system_session() as s:
        await s.execute(text(
            "update public.user_settings set notification_prefs = "
            "jsonb_set(coalesce(notification_prefs, '{}'::jsonb), :path, cast(:state as jsonb), true) "
            "where user_id = :uid"), {"path": [tg.STATE_KEY], "state": json.dumps(state, default=str), "uid": user_id})


def _state(prefs: dict[str, Any]) -> dict[str, Any]:
    st = prefs.get(tg.STATE_KEY)
    st = st if isinstance(st, dict) else {}
    st.setdefault("drafts", {})
    return st


# --- Webhook registration -----------------------------------------------------------------------
def webhook_url(user_id: UUID) -> str | None:
    base = get_settings().api_base_url.rstrip("/")
    return f"{base}/api/v1/telegram/webhook/{user_id}" if base.startswith("https://") else None


async def ensure_webhook(user_id: UUID) -> bool:
    """Point the user's bot at this server. Safe to repeat; only acts when the URL changed."""
    prefs, token = await _load(user_id)
    url = webhook_url(user_id)
    if not token or not prefs.get(tg.CHAT_KEY) or not url or not get_settings().telegram_assistant_enabled:
        return False
    if prefs.get(tg.HOOK_URL_KEY) == url and prefs.get(tg.HOOK_SECRET_KEY):
        return True
    secret = secrets.token_urlsafe(32)
    await tg.call(token, "setWebhook", {"url": url, "secret_token": secret,
                                        "allowed_updates": ["message", "callback_query"]})
    try:
        await tg.call(token, "setMyCommands", {"commands": [
            {"command": "help", "description": "What I can do"},
            {"command": "find", "description": "Find a mail, e.g. /find offer letter"},
            {"command": "send", "description": "Write a mail, e.g. /send to rahul: ..."},
        ]})
    except tg.TelegramError:
        pass
    async with system_session() as s:
        await s.execute(text(
            "update public.user_settings set notification_prefs = coalesce(notification_prefs, '{}'::jsonb) "
            "|| cast(:p as jsonb) where user_id = :uid"),
            {"p": json.dumps({tg.HOOK_SECRET_KEY: secret, tg.HOOK_URL_KEY: url}), "uid": user_id})
    log.info("telegram_webhook_set", user_id=str(user_id))
    return True


async def webhook_secret_ok(user_id: UUID, given: str | None) -> bool:
    prefs, _ = await _load(user_id)
    expected = prefs.get(tg.HOOK_SECRET_KEY)
    return bool(expected and given and secrets.compare_digest(str(expected), given))


# --- Formatting ---------------------------------------------------------------------------------
def esc(value: Any) -> str:
    return html.escape(str(value or ""))


def _fmt_date(dt: datetime | None, tz: str) -> str:
    if not dt:
        return ""
    try:
        return dt.astimezone(ZoneInfo(tz)).strftime("%d %b %Y, %I:%M %p")
    except Exception:
        return dt.strftime("%d %b %Y %H:%M UTC")


def _open_url(email_id: Any) -> str | None:
    base = get_settings().frontend_url.rstrip("/")
    return f"{base}/inbox/{email_id}" if base.startswith("https://") else None


def _preview(d: dict[str, Any]) -> str:
    to = f"{esc(d['to_name'])} &lt;{esc(d['to'])}&gt;" if d.get("to_name") else esc(d["to"])
    head = "↩️ <b>Reply preview</b>" if d.get("reply_to_message_id") else "📝 <b>Draft preview</b>"
    body = d["body"] if len(d["body"]) < 3300 else d["body"][:3300] + "…"
    note = f"\n\n<i>⚠️ {esc(d['notice'])}</i>" if d.get("notice") else ""
    return (f"{head}\n<b>To:</b> {to}\n<b>Subject:</b> {esc(d['subject'] or '(no subject)')}\n"
            f"──────────\n{esc(body)}{note}\n──────────\nApprove to send, or Rewrite for a new version.")


def _draft_buttons(did: str) -> tg.Buttons:
    return [
        [{"text": "✅ Approve & send", "callback_data": f"a:{did}"}],
        [{"text": "🔄 Rewrite", "callback_data": f"r:{did}"},
         {"text": "✏️ Change…", "callback_data": f"e:{did}"},
         {"text": "🗑 Delete", "callback_data": f"d:{did}"}],
    ]


# --- Intent -------------------------------------------------------------------------------------
def rule_intent(textv: str, has_focus: bool) -> AssistantIntentOutput:
    t = textv.strip()
    low = t.lower()
    if low.startswith("/find"):
        return AssistantIntentOutput(intent="find", search_query=t[5:].strip() or None)
    if low.startswith("/send"):
        t, low = t[5:].strip(), low[5:].strip()
        if not low.startswith(("to ", "mail", "email")):
            t, low = "to " + t, "to " + low
    if re.match(r"^(hi|hello|hey|help|/help|/start)\b", low):
        return AssistantIntentOutput(intent="help")
    if has_focus and re.match(r"^(reply|respond|answer|tell (them|him|her))\b", low):
        msg = re.sub(r"^(reply|respond|answer|tell (them|him|her))\s*(back)?\s*(to (them|him|her|it))?\s*(that|saying|:)?\s*",
                     "", t, flags=re.I)
        return AssistantIntentOutput(intent="reply", message=msg or t)
    m = re.match(r"^(?:please\s+)?(?:send|write|compose|draft|mail|email)?\s*(?:a\s+|an\s+)?(?:mail|email|message)?\s*"
                 r"to\s+(.+?)\s*(?:saying|that|about|telling|:|,|-)\s+(.+)$", t, flags=re.I | re.S)
    if m and (EMAIL_RE.search(m.group(1)) or re.match(r"^(send|write|compose|draft|mail|email|to)\b", low)):
        return AssistantIntentOutput(intent="compose", recipient=m.group(1).strip(), message=m.group(2).strip())
    return AssistantIntentOutput(intent="find", search_query=t)


async def classify(user_id: UUID, textv: str, st: dict[str, Any]) -> AssistantIntentOutput:
    focus = st.get("focus") or {}
    if textv.strip().lower().startswith(("/find", "/send", "/help", "/start")):
        return rule_intent(textv, bool(focus))
    llm = get_llm_service()
    if llm.available and not llm.circuit_open:
        ctx = [f"Email currently in focus: {'“' + focus.get('subject', '') + '” from ' + focus.get('from', '') if focus else 'none'}.",
               f"A draft is pending: {'yes' if st.get('drafts') else 'no'}."]
        try:
            out, _ = await llm.generate(task="assistant_intent", system_prompt=ASSISTANT_SYSTEM,
                                        untrusted={"chat_message": textv[:3000]}, trusted_context="\n".join(ctx),
                                        output_model=AssistantIntentOutput, user_id=user_id, max_tokens=500)
            return out
        except LLMError:
            pass
    return rule_intent(textv, bool(focus))


# --- Actions ------------------------------------------------------------------------------------
class Bot:
    def __init__(self, user_id: UUID, token: str, chat_id: int, prefs: dict[str, Any]) -> None:
        self.user_id, self.token, self.chat_id = user_id, token, chat_id
        self.st = _state(prefs)

    async def say(self, textv: str, buttons: tg.Buttons | None = None) -> int | None:
        return await tg.send_html(self.token, self.chat_id, textv, buttons)

    async def save(self) -> None:
        await _save_state(self.user_id, self.st)

    async def _tz(self) -> str:
        async with system_session() as s:
            us = await s.get(UserSettings, self.user_id)
        return us.timezone if us else "UTC"

    # Finding and describing mail
    async def find(self, query: str | None) -> None:
        if not query:
            await self.say("What mail should I look for? e.g. <i>offer letter from TCS</i>")
            return
        async with user_session(self.user_id) as s:
            res = await natural_language_search(s, self.user_id, query, limit=5)
        rows = res.results if res.target == "emails" else []
        if not rows:
            await self.say(f"I couldn't find a mail matching <i>{esc(query)}</i>. Try other words, a sender name or a company.")
            return
        if len(rows) == 1:
            await self.describe(rows[0]["id"])
            return
        tz = await self._tz()
        lines = [f"🔎 Found {len(rows)} mails for <i>{esc(query)}</i>:"]
        for i, r in enumerate(rows, 1):
            who = r.get("from_name") or r.get("from_address") or "unknown"
            lines.append(f"\n<b>{i}.</b> {esc(r.get('subject') or '(no subject)')}\n    {esc(who)} · {esc(_fmt_date(r.get('internal_date'), tz))}")
        buttons = [[{"text": f"{i}. Open", "callback_data": f"o:{r['id']}"} for i, r in enumerate(rows[:3], 1)]]
        if len(rows) > 3:
            buttons.append([{"text": f"{i}. Open", "callback_data": f"o:{r['id']}"} for i, r in enumerate(rows[3:], 4)])
        await self.say("\n".join(lines) + "\n\nTap one to read it.", buttons)

    async def describe(self, email_id: UUID | str) -> None:
        async with system_session() as s:
            row = (await s.execute(select(EmailMessage, EmailAnalysis)
                                   .join(EmailAnalysis, EmailAnalysis.message_id == EmailMessage.id, isouter=True)
                                   .where(EmailMessage.id == UUID(str(email_id)), EmailMessage.user_id == self.user_id)
                                   )).first()
        if row is None:
            await self.say("That mail is no longer available.")
            return
        m, a = row
        tz = await self._tz()
        sender = f"{m.from_name} <{m.from_address}>" if m.from_name else (m.from_address or "unknown")
        parts = [f"📧 <b>{esc(m.subject or '(no subject)')}</b>",
                 f"<b>From:</b> {esc(sender)}", f"<b>Date:</b> {esc(_fmt_date(m.internal_date, tz))}"]
        if a is not None:
            pr = getattr(a.effective_priority, "value", a.effective_priority)
            parts.append(f"<b>Priority:</b> {esc(pr)}" + (f" · {esc(a.category)}" if a.category else ""))
            if a.summary:
                parts.append(f"\n<b>What it's about:</b>\n{esc(a.summary)}")
            if a.suggested_action:
                parts.append(f"<b>What to do:</b> {esc(a.suggested_action)}")
            if a.deadline_at:
                parts.append(f"<b>Deadline:</b> {esc(_fmt_date(a.deadline_at, tz))}")
        body = (m.body_text or m.snippet or "").strip()
        body = re.sub(r"\n{3,}", "\n\n", body)
        if body:
            parts.append(f"\n<b>Mail:</b>\n{esc(body[:2200])}{'…' if len(body) > 2200 else ''}")
        if m.has_attachments:
            parts.append("📎 Has attachments (open in MailPilot to see them).")
        buttons: tg.Buttons = [[{"text": "↩️ Reply", "callback_data": f"y:{m.id}"}]]
        if url := _open_url(m.id):
            buttons[0].append({"text": "🌐 Open", "url": url})
        self.st["focus"] = {"id": str(m.id), "subject": (m.subject or "")[:150], "from": (m.from_name or m.from_address or "")[:100]}
        await self.save()
        await self.say("\n".join(parts), buttons)

    # Drafting
    async def _resolve_recipient(self, raw: str) -> tuple[str, str | None] | None:
        if m := EMAIL_RE.search(raw):
            return m.group(0).lower(), None
        items, _ = await compose.suggest_recipients(self.user_id, raw.strip()[:100], 3)
        if not items:
            return None
        return items[0]["email"], items[0].get("name")

    async def compose_new(self, recipient: str | None, message: str | None, subject_hint: str | None) -> None:
        if not message:
            await self.say("What should the mail say? e.g. <i>send mail to rahul saying the meeting moved to 5pm</i>")
            return
        if not recipient:
            self.st["await"] = {"kind": "recipient", "message": message, "subject": subject_hint or ""}
            await self.save()
            await self.say("Who should I send it to? Reply with their email address or name.")
            return
        resolved = await self._resolve_recipient(recipient)
        if resolved is None:
            self.st["await"] = {"kind": "recipient", "message": message, "subject": subject_hint or ""}
            await self.save()
            await self.say(f"I don't know <i>{esc(recipient)}</i> yet. Reply with their full email address.")
            return
        to, to_name = resolved
        await self._make_draft({"to": to, "to_name": to_name, "notes": message, "subject": subject_hint or ""})

    async def compose_reply(self, message: str | None) -> None:
        focus = self.st.get("focus")
        if not focus:
            await self.say("Which mail should I reply to? Find it first, e.g. <i>show me the mail from HR</i>.")
            return
        if not message:
            self.st["await"] = {"kind": "reply"}
            await self.save()
            await self.say(f"What should I reply to <b>{esc(focus['subject'])}</b>? Type it in your own words.")
            return
        async with system_session() as s:
            m = await s.get(EmailMessage, UUID(focus["id"]))
        if m is None or m.user_id != self.user_id:
            await self.say("That mail is no longer available.")
            return
        reply_to = EMAIL_RE.search(m.reply_to or "")
        to = reply_to.group(0) if reply_to else m.from_address
        subject = m.subject or ""
        if subject and not subject.lower().startswith("re:"):
            subject = f"Re: {subject}"
        context = f"From: {m.from_name or m.from_address}\nSubject: {m.subject}\n\n{(m.body_text or m.snippet or '')[:3000]}"
        await self._make_draft({"to": (to or "").lower(), "to_name": m.from_name, "notes": message, "subject": subject,
                                "thread_id": str(m.thread_id), "reply_to_message_id": str(m.id),
                                "account_id": str(m.account_id), "reply_context": context, "keep_subject": True})

    async def _make_draft(self, d: dict[str, Any]) -> None:
        await tg.typing(self.token, self.chat_id)
        p = await polish(self.user_id, d["notes"], subject=d.get("subject", ""), recipient_name=d.get("to_name"),
                         reply_context=d.get("reply_context"))
        d.update(body=p.body, subject=d["subject"] if d.get("keep_subject") and d.get("subject") else p.subject,
                 notice=f"{p.error}, so I only cleaned up your text." if p.error else None, created=time.time())
        did = secrets.token_hex(4)
        drafts = self.st["drafts"]
        drafts[did] = d
        for old in sorted(drafts, key=lambda k: drafts[k].get("created", 0))[:-MAX_DRAFTS]:
            drafts.pop(old, None)
        self.st.pop("await", None)
        d["msg"] = await self.say(_preview(d), _draft_buttons(did))
        await self.save()

    async def rewrite(self, did: str, feedback: str | None, message_id: int | None) -> None:
        d = self.st["drafts"].get(did)
        if not d:
            await self.say("That draft has expired. Tell me again what you want to send.")
            return
        await tg.typing(self.token, self.chat_id)
        p = await polish(self.user_id, d["notes"], subject=d.get("subject", ""), recipient_name=d.get("to_name"),
                         previous=d["body"], feedback=feedback, reply_context=d.get("reply_context"))
        if feedback:
            d["notes"] = f"{d['notes']}\n(Also: {feedback})"
        d.update(body=p.body, notice=f"{p.error}, so I only cleaned up your text." if p.error else None)
        if not d.get("keep_subject"):
            d["subject"] = p.subject
        self.st.pop("await", None)
        target = message_id or d.get("msg")
        if target and not feedback:
            await tg.edit_html(self.token, self.chat_id, target, _preview(d), _draft_buttons(did))
        else:
            if target:
                await tg.edit_html(self.token, self.chat_id, target, "✏️ Replaced by the new version below.")
            d["msg"] = await self.say(_preview(d), _draft_buttons(did))
        await self.save()

    async def approve(self, did: str, message_id: int | None) -> None:
        d = self.st["drafts"].get(did)
        if not d:
            await self.say("That draft has expired or was already sent.")
            return
        try:
            r = await compose.send_composed(
                self.user_id, to=[d["to"]], cc=[], bcc=[], subject=d["subject"], body=d["body"],
                undo_seconds=UNDO_SECONDS, account_id=UUID(d["account_id"]) if d.get("account_id") else None,
                thread_id=UUID(d["thread_id"]) if d.get("thread_id") else None,
                reply_to_message_id=UUID(d["reply_to_message_id"]) if d.get("reply_to_message_id") else None,
                event="telegram.send_scheduled")
        except PermissionUpgradeRequired:
            url = f"{get_settings().frontend_url.rstrip('/')}/settings/accounts"
            await self.say("MailPilot needs Gmail <b>send</b> permission first. Open Settings → Accounts and grant it, "
                           "then tap Approve again.", [[{"text": "Open settings", "url": url}]] if url.startswith("https://") else None)
            return
        except AppError as exc:
            await self.say(f"Couldn't send: {esc(exc.message)}")
            return
        self.st["drafts"].pop(did, None)
        await self.save()
        text_done = f"✅ <b>Sending to {esc(d['to'])}</b> in {UNDO_SECONDS} seconds.\n<b>Subject:</b> {esc(d['subject'])}"
        undo = [[{"text": "↩️ Undo", "callback_data": f"u:{r.approval.id}"}]]
        if message_id:
            await tg.edit_html(self.token, self.chat_id, message_id, text_done, undo)
        else:
            await self.say(text_done, undo)

    async def undo(self, approval_id: str, message_id: int | None) -> None:
        try:
            draft = await compose.undo_send(self.user_id, UUID(approval_id))
        except AppError:
            msg = "Too late to undo: the mail has been sent."
            if message_id:
                await tg.edit_html(self.token, self.chat_id, message_id, f"📤 {msg}")
            else:
                await self.say(msg)
            return
        did = secrets.token_hex(4)
        d = {"to": (draft.to_addresses or [""])[0], "to_name": None, "subject": draft.subject, "body": draft.body,
             "notes": draft.body, "created": time.time(),
             "thread_id": str(draft.thread_id) if draft.thread_id else None,
             "reply_to_message_id": str(draft.reply_to_message_id) if draft.reply_to_message_id else None,
             "account_id": str(draft.account_id), "keep_subject": True}
        self.st["drafts"][did] = d
        if message_id:
            await tg.edit_html(self.token, self.chat_id, message_id, _preview(d), _draft_buttons(did))
            d["msg"] = message_id
        else:
            d["msg"] = await self.say(_preview(d), _draft_buttons(did))
        await self.save()

    async def delete(self, did: str, message_id: int | None) -> None:
        self.st["drafts"].pop(did, None)
        if self.st.get("await", {}).get("draft") == did:
            self.st.pop("await", None)
        await self.save()
        if message_id:
            await tg.edit_html(self.token, self.chat_id, message_id, "🗑 Draft deleted. Nothing was sent.")

    # Entry points
    async def on_text(self, textv: str) -> None:
        low = textv.strip().lower()
        if low in ("/start", "/help", "help"):
            await self.say(HELP)
            return
        if low in ("/cancel", "cancel"):
            self.st.pop("await", None)
            await self.save()
            await self.say("Okay, cancelled.")
            return
        waiting = self.st.get("await") or {}
        if waiting.get("kind") == "recipient":
            await self.compose_new(textv.strip(), waiting.get("message"), waiting.get("subject"))
            return
        if waiting.get("kind") == "reply":
            await self.compose_reply(textv.strip())
            return
        if waiting.get("kind") == "feedback" and waiting.get("draft") in self.st["drafts"]:
            await self.rewrite(waiting["draft"], textv.strip(), None)
            return
        await tg.typing(self.token, self.chat_id)
        intent = await classify(self.user_id, textv, self.st)
        if intent.intent == "find":
            await self.find(intent.search_query or textv)
        elif intent.intent == "compose":
            await self.compose_new(intent.recipient, intent.message, intent.subject_hint)
        elif intent.intent == "reply":
            await self.compose_reply(intent.message)
        elif intent.intent == "revise" and self.st["drafts"]:
            latest = max(self.st["drafts"], key=lambda k: self.st["drafts"][k].get("created", 0))
            await self.rewrite(latest, intent.message or textv, None)
        elif intent.intent == "help":
            await self.say(HELP)
        else:
            await self.find(textv)

    async def on_callback(self, data: str, message_id: int | None) -> None:
        kind, _, arg = data.partition(":")
        if kind == "o":
            await self.describe(arg)
        elif kind == "y":
            async with system_session() as s:
                m = await s.get(EmailMessage, UUID(arg))
            if m and m.user_id == self.user_id:
                self.st["focus"] = {"id": str(m.id), "subject": (m.subject or "")[:150],
                                    "from": (m.from_name or m.from_address or "")[:100]}
                await self.compose_reply(None)
        elif kind == "a":
            await self.approve(arg, message_id)
        elif kind == "r":
            await self.rewrite(arg, None, message_id)
        elif kind == "e":
            if arg in self.st["drafts"]:
                self.st["await"] = {"kind": "feedback", "draft": arg}
                await self.save()
                await self.say("What should I change? e.g. <i>make it shorter</i> or <i>add that I can join on Monday</i>.")
        elif kind == "d":
            await self.delete(arg, message_id)
        elif kind == "u":
            await self.undo(arg, message_id)


async def handle_update(user_id: UUID, update: dict[str, Any]) -> dict[str, Any]:
    prefs, token = await _load(user_id)
    chat_id = prefs.get(tg.CHAT_KEY)
    if not token or not chat_id:
        return {"ignored": "not_linked"}
    bot = Bot(user_id, token, int(chat_id), prefs)
    if cb := update.get("callback_query"):
        msg = cb.get("message") or {}
        if (msg.get("chat") or {}).get("id") != int(chat_id):
            return {"ignored": "other_chat"}
        await tg.answer_callback(token, cb["id"])
        await bot.on_callback(str(cb.get("data") or ""), msg.get("message_id"))
        return {"handled": "callback"}
    msg = update.get("message") or {}
    if (msg.get("chat") or {}).get("id") != int(chat_id):
        return {"ignored": "other_chat"}
    textv = str(msg.get("text") or "").strip()
    if not textv:
        await bot.say("Send me text messages. Voice notes and files aren't supported yet.")
        return {"handled": "non_text"}
    try:
        await bot.on_text(textv[:4000])
    except tg.TelegramError:
        raise
    except Exception as exc:
        log.warning("telegram_assistant_failed", error_type=type(exc).__name__, error=str(exc)[:300])
        await bot.say("Sorry, something went wrong on my side. Please try again in a moment.")
    return {"handled": "message"}


async def users_needing_webhook() -> list[UUID]:
    url_ok = get_settings().api_base_url.startswith("https://") and get_settings().telegram_assistant_enabled
    if not url_ok:
        return []
    async with system_session() as s:
        rows = (await s.execute(text(
            "select user_id from public.user_settings where notification_prefs ? 'telegram_chat_id' "
            "and notification_prefs ? 'telegram_bot_token_enc' and "
            "coalesce(notification_prefs->>'telegram_webhook_url', '') <> "
            "(:base || '/api/v1/telegram/webhook/' || user_id::text)"),
            {"base": get_settings().api_base_url.rstrip("/")})).scalars().all()
    return list(rows)

