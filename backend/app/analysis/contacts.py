"""Relationship memory for a single contact, built from scoped retrieval of recent messages."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import or_, select

from app.db.models import Commitment, Contact, EmailMessage
from app.db.session import system_session
from app.errors import NotFoundError, ServiceUnavailableError
from app.llm.base import LLMError
from app.llm.prompts import CONTACT_SYSTEM
from app.llm.schemas import ContactSummaryOutput
from app.llm.service import LLMService, get_llm_service

RECENT_LIMIT = 12


async def refresh_relationship_summary(user_id: UUID, contact_id: UUID, llm: LLMService | None = None) -> Contact:
    llm = llm or get_llm_service()
    async with system_session() as s:
        contact = await s.get(Contact, contact_id)
        if contact is None or contact.user_id != user_id:
            raise NotFoundError("Contact not found")
        # Scoped retrieval: only messages exchanged with this contact, most recent first.
        messages = (await s.execute(
            select(EmailMessage)
            .where(EmailMessage.user_id == user_id, EmailMessage.is_deleted.is_(False),
                   or_(EmailMessage.from_address == contact.email,
                       EmailMessage.to_addresses.contains([{"email": contact.email}])))
            .order_by(EmailMessage.internal_date.desc()).limit(RECENT_LIMIT)
        )).scalars().all()
        commitments = (await s.execute(
            select(Commitment).where(Commitment.user_id == user_id, Commitment.status.in_(["open", "suggested"]),
                                     Commitment.counterparty.ilike(f"%{contact.email}%"))
        )).scalars().all()
    if not messages:
        raise NotFoundError("No messages with this contact yet")
    if not llm.available:
        raise ServiceUnavailableError("Remote inference is not configured or unavailable", code="llm_unavailable")
    transcript = "\n\n---\n\n".join(
        f"{'OWNER → contact' if m.is_sent else 'contact → OWNER'} | {m.internal_date.date()} | {m.subject}\n"
        f"{(m.body_text or m.snippet or '')[:1500]}" for m in reversed(messages)
    )
    known = "\n".join(f"- ({c.direction}) {c.description}" for c in commitments) or "none recorded"
    try:
        out, _ = await llm.generate(
            task="contact_summary", system_prompt=CONTACT_SYSTEM, untrusted={"messages": transcript},
            trusted_context=f"Contact: {contact.display_name or ''} <{contact.email}>. Known open commitments:\n{known}",
            output_model=ContactSummaryOutput, user_id=user_id, max_tokens=700,
        )
    except LLMError as exc:
        raise ServiceUnavailableError(f"Relationship summary unavailable ({exc.code})", code="llm_unavailable") from exc
    summary = out.relationship_summary
    if out.open_commitments:
        summary += "\n\nOpen commitments:\n" + "\n".join(f"• {c}" for c in out.open_commitments)
    if out.recent_decisions:
        summary += "\n\nRecent decisions:\n" + "\n".join(f"• {d}" for d in out.recent_decisions)
    if out.communication_notes:
        summary += f"\n\nNotes: {out.communication_notes}"
    async with system_session() as s:
        row = await s.get(Contact, contact_id)
        assert row is not None
        row.relationship_summary = summary[:4000]
        row.relationship_summary_at = datetime.now(UTC)
        await s.flush()
        return row
