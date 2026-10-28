"""Synthetic Gmail and LLM fakes. No real mailbox data is used anywhere in tests."""

from __future__ import annotations

import base64
import json
from collections.abc import Callable
from typing import Any

from app.gmail.client import GmailHistoryExpiredError, GmailNotFoundError
from app.llm.base import ChatMessage, CompletionResult, HealthReport, LLMUnavailableError


def b64(text: str | bytes) -> str:
    data = text.encode() if isinstance(text, str) else text
    return base64.urlsafe_b64encode(data).decode().rstrip("=")


def gmail_message(
    mid: str, *, thread_id: str | None = None, subject: str = "Hello", sender: str = "Sam Sender <sam@example.org>",
    to: str = "owner@test.mailpilot", body: str = "Hi there", html: str | None = None,
    labels: list[str] | None = None, internal_ms: int = 1_790_000_000_000, extra_headers: dict[str, str] | None = None,
    attachments: list[dict[str, Any]] | None = None, message_id_header: str | None = None,
) -> dict[str, Any]:
    headers = [{"name": "Subject", "value": subject}, {"name": "From", "value": sender}, {"name": "To", "value": to},
               {"name": "Message-ID", "value": message_id_header or f"<{mid}@example.org>"}]
    for k, v in (extra_headers or {}).items():
        headers.append({"name": k, "value": v})
    parts: list[dict[str, Any]] = [{"partId": "0.0", "mimeType": "text/plain", "headers": [
        {"name": "Content-Type", "value": "text/plain; charset=utf-8"}], "body": {"data": b64(body), "size": len(body)}}]
    if html is not None:
        parts.append({"partId": "0.1", "mimeType": "text/html", "headers": [
            {"name": "Content-Type", "value": "text/html; charset=utf-8"}], "body": {"data": b64(html), "size": len(html)}})
    alt = {"partId": "0", "mimeType": "multipart/alternative", "headers": [], "parts": parts}
    payload_parts = [alt]
    for i, att in enumerate(attachments or [], start=1):
        payload_parts.append({
            "partId": str(i), "mimeType": att["mime"], "filename": att["filename"],
            "headers": [{"name": "Content-Disposition", "value": f'attachment; filename="{att["filename"]}"'}],
            "body": {"attachmentId": att.get("id", f"att-{mid}-{i}"), "size": att.get("size", 100)},
        })
    return {
        "id": mid, "threadId": thread_id or f"t-{mid}", "labelIds": labels or ["INBOX", "UNREAD"],
        "snippet": body[:100], "historyId": "100", "internalDate": str(internal_ms), "sizeEstimate": 1234,
        "payload": {"partId": "", "mimeType": "multipart/mixed", "headers": headers, "parts": payload_parts},
    }


class FakeGmail:
    """In-memory stand-in for GmailClient with history, labels, attachments and sends."""

    def __init__(self, messages: list[dict[str, Any]] | None = None, email: str = "owner@test.mailpilot") -> None:
        self.messages = {m["id"]: m for m in messages or []}
        self.email = email
        self.history_id = 1000
        self.history: list[dict[str, Any]] = []
        self.history_expired = False
        self.labels = [{"id": "INBOX", "name": "INBOX", "type": "system"}, {"id": "UNREAD", "name": "UNREAD", "type": "system"}]
        self.sent: list[dict[str, Any]] = []
        self.attachments: dict[str, bytes] = {}
        self.modified: list[tuple[str, list[str], list[str]]] = []
        self.fail_send_after_delivery = False
        self.calls: list[str] = []

    async def aclose(self) -> None:
        return None

    async def get_profile(self) -> dict[str, Any]:
        self.calls.append("profile")
        return {"emailAddress": self.email, "historyId": str(self.history_id)}

    async def list_messages(self, *, query: str | None = None, page_token: str | None = None, max_results: int = 100,
                            include_spam_trash: bool = False) -> dict[str, Any]:
        self.calls.append(f"list:{query}")
        if query and query.startswith("rfc822msgid:"):
            wanted = query.split(":", 1)[1]
            hits = [m for m in self.messages.values()
                    if any(h["name"] == "Message-ID" and h["value"].strip("<>") == wanted for h in m["payload"]["headers"])]
            return {"messages": [{"id": h["id"]} for h in hits[:1]]}
        ids = sorted(self.messages)
        start = int(page_token or 0)
        page = ids[start:start + max_results]
        out: dict[str, Any] = {"messages": [{"id": i, "threadId": self.messages[i]["threadId"]} for i in page]}
        if start + max_results < len(ids):
            out["nextPageToken"] = str(start + max_results)
        return out

    async def get_message(self, message_id: str, fmt: str = "full") -> dict[str, Any]:
        self.calls.append(f"get:{message_id}:{fmt}")
        if message_id not in self.messages:
            raise GmailNotFoundError("missing", 404)
        msg = self.messages[message_id]
        if fmt == "minimal":
            return {"id": msg["id"], "threadId": msg["threadId"], "labelIds": msg["labelIds"]}
        return msg

    async def list_history(self, start_history_id: str, page_token: str | None = None) -> dict[str, Any]:
        if self.history_expired:
            raise GmailHistoryExpiredError("expired", 404)
        return {"history": list(self.history), "historyId": str(self.history_id)}

    async def get_attachment(self, message_id: str, attachment_id: str) -> dict[str, Any]:
        return {"data": b64(self.attachments[attachment_id]), "size": len(self.attachments[attachment_id])}

    async def list_labels(self) -> dict[str, Any]:
        return {"labels": self.labels}

    async def create_label(self, name: str) -> dict[str, Any]:
        label = {"id": f"Label_{len(self.labels)}", "name": name, "type": "user"}
        self.labels.append(label)
        return label

    async def modify_message(self, message_id: str, add: list[str] | None = None, remove: list[str] | None = None) -> dict[str, Any]:
        self.modified.append((message_id, add or [], remove or []))
        return {"id": message_id}

    async def send_raw(self, raw_b64url: str, thread_id: str | None) -> dict[str, Any]:
        raw = base64.urlsafe_b64decode(raw_b64url + "=" * (-len(raw_b64url) % 4)).decode()
        mid = f"sent-{len(self.sent) + 1}"
        msg_id_header = next(line.split(":", 1)[1].strip() for line in raw.splitlines() if line.lower().startswith("message-id:"))
        self.sent.append({"id": mid, "raw": raw, "thread_id": thread_id})
        self.messages[mid] = gmail_message(mid, thread_id=thread_id, labels=["SENT"], message_id_header=msg_id_header)
        if self.fail_send_after_delivery:
            raise ConnectionError("network dropped after Gmail accepted the message")
        return {"id": mid, "threadId": thread_id}

    async def find_by_rfc822_id(self, rfc822_id: str) -> str | None:
        result = await self.list_messages(query=f"rfc822msgid:{rfc822_id.strip().strip('<>')}")
        msgs = result.get("messages") or []
        return msgs[0]["id"] if msgs else None


class FakeProvider:
    """Scriptable LLM provider. ``responder`` returns raw text (or raises) per call."""

    name = "fake"

    def __init__(self, responder: Callable[[list[ChatMessage], str], str] | None = None,
                 responses: list[str | Exception] | None = None) -> None:
        self.responder = responder
        self.responses = list(responses or [])
        self.calls: list[tuple[list[ChatMessage], str]] = []

    async def complete(self, messages: list[ChatMessage], *, json_schema: dict[str, Any] | None, schema_name: str,
                       max_tokens: int, temperature: float, request_id: str) -> CompletionResult:
        self.calls.append((messages, schema_name))
        if self.responses:
            item = self.responses.pop(0)
            if isinstance(item, Exception):
                raise item
            return CompletionResult(text=item, model="fake-model")
        if self.responder is None:
            raise LLMUnavailableError("no response scripted")
        return CompletionResult(text=self.responder(messages, schema_name), model="fake-model")

    async def health(self) -> HealthReport:
        return HealthReport(True, 5, "fake-model", True, ["fake-model"])

    async def aclose(self) -> None:
        return None


def analysis_json(**overrides: Any) -> str:
    base: dict[str, Any] = {
        "summary": "Synthetic summary.", "explanation": "Synthetic explanation.", "priority": "MEDIUM",
        "components": {"deadline_urgency": 40, "action_required": 50, "impact_if_ignored": 40,
                       "sender_importance": 40, "conversation_context": 30},
        "confidence": 0.8, "reply_needed": False, "action_required": True, "suggested_next_action": "Review",
        "deadline": None, "entities": {}, "category": "work", "is_newsletter": False, "is_notification": False,
        "risk_flags": [], "tasks": [], "commitments": [], "meeting": None, "prompt_injection_detected": False,
    }
    base.update(overrides)
    return json.dumps(base)
