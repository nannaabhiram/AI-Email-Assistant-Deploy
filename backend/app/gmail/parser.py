"""Gmail API message (format=full) parsing.

Converts the Gmail JSON payload tree into a flat, safe representation: decoded plain
text (HTML is converted to text, never rendered), addresses, selected headers,
attachment metadata, extracted links and inline calendar invitations.
"""

from __future__ import annotations

import base64
import hashlib
import re
from dataclasses import dataclass, field
from datetime import UTC, datetime
from email.header import decode_header, make_header
from email.utils import getaddresses
from typing import Any

from bs4 import BeautifulSoup, Comment

KEPT_HEADERS = {
    "list-unsubscribe",
    "list-id",
    "precedence",
    "auto-submitted",
    "authentication-results",
    "return-path",
    "x-auto-response-suppress",
    "content-language",
}
MAX_BODY_CHARS = 200_000


@dataclass(slots=True)
class Address:
    email: str
    name: str = ""

    def as_dict(self) -> dict[str, str]:
        return {"email": self.email, "name": self.name}


@dataclass(slots=True)
class Link:
    url: str
    text: str = ""


@dataclass(slots=True)
class AttachmentMeta:
    part_id: str
    filename: str
    mime_type: str
    size_bytes: int
    gmail_attachment_id: str | None
    inline_data: bytes | None = None


@dataclass(slots=True)
class ParsedMessage:
    gmail_message_id: str
    gmail_thread_id: str
    history_id: str | None
    label_ids: list[str]
    snippet: str
    internal_date: datetime
    size_estimate: int | None
    subject: str
    from_address: Address | None
    reply_to: Address | None
    to: list[Address]
    cc: list[Address]
    bcc: list[Address]
    rfc822_message_id: str | None
    in_reply_to: str | None
    references: str | None
    headers: dict[str, str]
    body_text: str
    has_html: bool
    links: list[Link] = field(default_factory=list)
    attachments: list[AttachmentMeta] = field(default_factory=list)
    calendar_parts: list[str] = field(default_factory=list)

    @property
    def is_unread(self) -> bool:
        return "UNREAD" in self.label_ids

    @property
    def is_sent(self) -> bool:
        return "SENT" in self.label_ids

    def content_hash(self) -> str:
        normalized_subject = re.sub(r"^((re|fw|fwd)\s*:\s*)+", "", self.subject.strip(), flags=re.I).lower()
        body = re.sub(r"\s+", " ", self.body_text).strip().lower()[:5000]
        sender = self.from_address.email.lower() if self.from_address else ""
        return hashlib.sha256(f"{sender}\n{normalized_subject}\n{body}".encode()).hexdigest()


def b64url_decode(data: str) -> bytes:
    return base64.urlsafe_b64decode(data + "=" * (-len(data) % 4))


def decode_mime_words(value: str) -> str:
    try:
        return str(make_header(decode_header(value)))
    except Exception:  # malformed encoded-words: keep raw text
        return value


def parse_addresses(value: str | None) -> list[Address]:
    if not value:
        return []
    out: list[Address] = []
    for name, email in getaddresses([decode_mime_words(value)]):
        email = email.strip().lower()
        if "@" in email and len(email) <= 320:
            out.append(Address(email=email, name=name.strip().strip('"')))
    return out


def _charset(headers: dict[str, str]) -> str:
    match = re.search(r'charset="?([\w\-.:]+)"?', headers.get("content-type", ""), re.I)
    return match.group(1) if match else "utf-8"


def _decode_text(data: str, charset: str) -> str:
    raw = b64url_decode(data)
    try:
        return raw.decode(charset, errors="replace")
    except LookupError:
        return raw.decode("utf-8", errors="replace")


def html_to_text(html: str) -> tuple[str, list[Link]]:
    """Convert untrusted HTML to plain text and collect links. Nothing is executed or fetched."""
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "head", "noscript", "template", "svg", "iframe", "object", "embed"]):
        tag.decompose()
    for comment in soup.find_all(string=lambda s: isinstance(s, Comment)):
        comment.extract()
    links: list[Link] = []
    for a in soup.find_all("a", href=True):
        href = str(a.get("href", "")).strip()
        if href.lower().startswith(("http://", "https://")):
            links.append(Link(url=href[:2048], text=a.get_text(" ", strip=True)[:300]))
    for br in soup.find_all("br"):
        br.replace_with("\n")
    for block in soup.find_all(["p", "div", "tr", "li", "h1", "h2", "h3", "h4", "table", "blockquote"]):
        block.insert_after("\n")
    text = soup.get_text()
    text = re.sub(r"[ \t ]+", " ", text)
    text = re.sub(r"\n\s*\n\s*\n+", "\n\n", text)
    return text.strip(), links


_URL_RE = re.compile(r"https?://[^\s<>\"')\]]+", re.I)


def extract_text_links(text: str) -> list[Link]:
    return [Link(url=m.group(0)[:2048]) for m in _URL_RE.finditer(text)]


def _walk(part: dict[str, Any], acc: dict[str, Any]) -> None:
    headers = {h["name"].lower(): h["value"] for h in part.get("headers", []) if "name" in h}
    mime = (part.get("mimeType") or "").lower()
    body = part.get("body") or {}
    filename = part.get("filename") or ""
    disposition = headers.get("content-disposition", "").lower()

    if part.get("parts"):
        for child in part["parts"]:
            _walk(child, acc)
        return

    is_attachment = bool(filename) or "attachment" in disposition or (
        body.get("attachmentId") and not mime.startswith("text/")
    )
    if mime == "text/calendar" and body.get("data"):
        acc["calendar"].append(_decode_text(body["data"], _charset(headers)))
        if not filename:
            return
    if is_attachment:
        acc["attachments"].append(
            AttachmentMeta(
                part_id=str(part.get("partId") or len(acc["attachments"])),
                filename=decode_mime_words(filename)[:255] or "attachment",
                mime_type=mime or "application/octet-stream",
                size_bytes=int(body.get("size") or 0),
                gmail_attachment_id=body.get("attachmentId"),
                inline_data=b64url_decode(body["data"]) if body.get("data") else None,
            )
        )
        return
    if mime == "text/plain" and body.get("data"):
        acc["plain"].append(_decode_text(body["data"], _charset(headers)))
    elif mime == "text/html" and body.get("data"):
        acc["html"].append(_decode_text(body["data"], _charset(headers)))
    elif not mime and body.get("data"):
        acc["plain"].append(_decode_text(body["data"], "utf-8"))


def parse_gmail_message(msg: dict[str, Any]) -> ParsedMessage:
    payload = msg.get("payload") or {}
    header_list = payload.get("headers", [])
    headers_all: dict[str, str] = {}
    for h in header_list:
        name = h.get("name", "").lower()
        if name and name not in headers_all:
            headers_all[name] = h.get("value", "")

    acc: dict[str, Any] = {"plain": [], "html": [], "attachments": [], "calendar": []}
    _walk(payload, acc)

    links: list[Link] = []
    html_text = ""
    if acc["html"]:
        html_text, links = html_to_text("\n".join(acc["html"]))
    plain = "\n".join(acc["plain"]).strip()
    body_text = plain or html_text
    if not acc["html"]:
        links = extract_text_links(body_text)
    body_text = body_text.replace("\x00", "")[:MAX_BODY_CHARS]

    from_list = parse_addresses(headers_all.get("from"))
    reply_list = parse_addresses(headers_all.get("reply-to"))
    internal_ms = int(msg.get("internalDate") or 0)

    return ParsedMessage(
        gmail_message_id=msg["id"],
        gmail_thread_id=msg.get("threadId") or msg["id"],
        history_id=msg.get("historyId"),
        label_ids=list(msg.get("labelIds") or []),
        snippet=(msg.get("snippet") or "")[:1000],
        internal_date=datetime.fromtimestamp(internal_ms / 1000, tz=UTC),
        size_estimate=msg.get("sizeEstimate"),
        subject=decode_mime_words(headers_all.get("subject", ""))[:998],
        from_address=from_list[0] if from_list else None,
        reply_to=reply_list[0] if reply_list else None,
        to=parse_addresses(headers_all.get("to")),
        cc=parse_addresses(headers_all.get("cc")),
        bcc=parse_addresses(headers_all.get("bcc")),
        rfc822_message_id=headers_all.get("message-id"),
        in_reply_to=headers_all.get("in-reply-to"),
        references=headers_all.get("references"),
        headers={k: v[:2000] for k, v in headers_all.items() if k in KEPT_HEADERS},
        body_text=body_text,
        has_html=bool(acc["html"]),
        links=links[:200],
        attachments=acc["attachments"],
        calendar_parts=acc["calendar"],
    )
