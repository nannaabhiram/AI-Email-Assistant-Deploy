"""Turn the owner's rough notes into a polished, professional email (DGX LLM, rule-based fallback)."""

from __future__ import annotations

import re
from dataclasses import dataclass
from uuid import UUID

from app.db.models import Profile
from app.db.session import system_session
from app.llm.base import LLMError
from app.llm.prompts import REWRITE_SYSTEM
from app.llm.schemas import ProfessionalRewriteOutput
from app.llm.service import get_llm_service
from app.logging import get_logger

log = get_logger(__name__)


@dataclass(slots=True)
class Polished:
    subject: str
    body: str
    source: str  # "llm" | "rules"
    error: str | None = None


async def sender_name(user_id: UUID) -> str | None:
    async with system_session() as s:
        profile = await s.get(Profile, user_id)
    if profile is None:
        return None
    if profile.display_name and profile.display_name.strip():
        return profile.display_name.strip()
    if profile.email:
        local = profile.email.split("@")[0]
        return " ".join(p.capitalize() for p in re.split(r"[._\-0-9]+", local) if p) or None
    return None


def _basic_cleanup(notes: str, subject: str, recipient_name: str | None, name: str | None, error: str) -> Polished:
    text = re.sub(r"[ \t]+", " ", notes.strip())
    text = re.sub(r"\bi\b", "I", text)
    sentences = re.split(r"(?<=[.!?])\s+", text)
    text = " ".join(s[:1].upper() + s[1:] for s in sentences if s)
    if text and text[-1] not in ".!?":
        text += "."
    greeting = f"Dear {recipient_name}," if recipient_name else "Hello,"
    closing = "Best regards," + (f"\n{name}" if name else "")
    subj = subject.strip() or (text.split(".")[0][:60] if text else "")
    return Polished(subject=subj, body=f"{greeting}\n\n{text}\n\n{closing}", source="rules", error=error)


async def polish(
    user_id: UUID, notes: str, *, subject: str = "", recipient_name: str | None = None,
    previous: str | None = None, feedback: str | None = None, reply_context: str | None = None,
) -> Polished:
    """Rewrite ``notes`` professionally. ``previous`` + no feedback asks for a different alternative."""
    name = await sender_name(user_id)
    llm = get_llm_service()
    if not llm.available or llm.circuit_open:
        return _basic_cleanup(notes, subject, recipient_name, name, "AI is offline")
    trusted = [
        f"Owner's name for the sign-off: {name or 'unknown (omit the name)'}.",
        f"Recipient: {recipient_name or 'unknown (use a neutral greeting)'}.",
        f"Current subject: {subject.strip() or '(none, write one)'}.",
    ]
    untrusted = {"owner_notes": notes[:6000]}
    if reply_context:
        trusted.append("This is a reply to the email in REPLY_TO. Answer it appropriately; do not quote it.")
        untrusted["reply_to"] = reply_context[:4000]
    if previous:
        untrusted["previous_version"] = previous[:6000]
        trusted.append("Apply the owner's feedback to the previous version." if feedback
                       else "Write a clearly different alternative to the previous version (same meaning).")
    if feedback:
        untrusted["owner_feedback"] = feedback[:1000]
    try:
        out, _ = await llm.generate(
            task="professional_rewrite", system_prompt=REWRITE_SYSTEM, untrusted=untrusted,
            trusted_context="\n".join(trusted), output_model=ProfessionalRewriteOutput, user_id=user_id,
            max_tokens=1200, temperature=0.7 if previous and not feedback else 0.3,
        )
    except LLMError as exc:
        log.info("rewrite_llm_failed", code=exc.code)
        return _basic_cleanup(notes, subject, recipient_name, name, "AI is unavailable right now")
    return Polished(subject=(out.subject or subject).strip()[:200], body=out.body.strip(), source="llm")

