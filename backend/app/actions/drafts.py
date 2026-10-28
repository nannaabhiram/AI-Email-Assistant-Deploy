"""Reply drafts: AI generation, editing with optimistic concurrency, versions."""

from __future__ import annotations

import re
from email.utils import parseaddr
from typing import Any
from uuid import UUID
from zoneinfo import ZoneInfo

from sqlalchemy import func, select, update

from app.db.models import (
    ConnectedAccount,
    Contact,
    ContactPreference,
    Draft,
    DraftStatus,
    DraftVersion,
    EmailMessage,
    UserSettings,
)
from app.db.session import system_session
from app.errors import AppError, ConflictError, NotFoundError
from app.llm.base import LLMError
from app.llm.prompts import REPLY_SYSTEM
from app.llm.schemas import ReplyDraftOutput
from app.llm.service import LLMService, get_llm_service
from app.services.audit import record_audit

TONES = {
    "professional": "Professional: clear, courteous, businesslike.",
    "friendly": "Friendly: warm and personable while staying appropriate.",
    "formal": "Formal: polite, structured, no contractions.",
    "concise": "Concise: as short as possible while complete, 2-5 sentences.",
}
EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,63}$")


def validate_addresses(addresses: list[str], field: str) -> list[str]:
    out: list[str] = []
    for raw in addresses:
        _, addr = parseaddr(raw.strip())
        addr = addr.lower()
        if not EMAIL_RE.match(addr) or len(addr) > 320:
            raise AppError(f"Invalid email address in {field}: {raw!r}", code="invalid_recipient")
        if addr not in out:
            out.append(addr)
    if len(out) > 50:
        raise AppError(f"Too many recipients in {field}", code="invalid_recipient")
    return out


def reply_subject(subject: str | None) -> str:
    subject = (subject or "").strip()
    return subject if re.match(r"^re:", subject, re.I) else f"Re: {subject}".strip()


def tone_instruction(tone: str, custom: str | None) -> str:
    if tone == "custom":
        if not custom or not custom.strip():
            raise AppError("Describe the custom tone", code="invalid_tone")
        return f"Custom tone requested by the owner: {custom.strip()[:300]}"
    if tone not in TONES:
        raise AppError("Unknown tone", code="invalid_tone")
    return TONES[tone]


async def _generate_body(llm: LLMService, user_id: UUID, account_email: str, thread_msgs: list[EmailMessage],
                         target: EmailMessage, tone: str, custom_tone: str | None, instructions: str | None,
                         tz: str, preferred_tone: str | None) -> tuple[ReplyDraftOutput, str]:
    transcript = "\n\n---\n\n".join(
        f"From: {m.from_name or ''} <{m.from_address}>{' (owner)' if m.is_sent else ''}\n"
        f"Date: {m.internal_date.astimezone(ZoneInfo(tz)).isoformat()}\nSubject: {m.subject}\n\n"
        f"{(m.body_text or m.snippet or '')[:3500]}"
        for m in thread_msgs
    )
    trusted = (
        f"Mailbox owner: {account_email}. Reply to the message from {target.from_address} "
        f"dated {target.internal_date.astimezone(ZoneInfo(tz)).isoformat()}.\n"
        f"Tone: {tone_instruction(tone, custom_tone)}\n"
        + (f"Contact preference: {preferred_tone}\n" if preferred_tone else "")
        + (f"Owner's instructions for this reply (trusted): {instructions.strip()[:1000]}\n" if instructions else "")
    )
    out, meta = await llm.generate(
        task="reply_draft", system_prompt=REPLY_SYSTEM, untrusted={"thread": transcript}, trusted_context=trusted,
        output_model=ReplyDraftOutput, user_id=user_id, max_tokens=900,
    )
    return out, meta.model


async def create_reply_draft(user_id: UUID, message_id: UUID, tone: str = "professional",
                             custom_tone: str | None = None, instructions: str | None = None,
                             use_ai: bool = True, llm: LLMService | None = None) -> Draft:
    llm = llm or get_llm_service()
    tone_instruction(tone, custom_tone)
    async with system_session() as s:
        target = await s.get(EmailMessage, message_id)
        if target is None or target.user_id != user_id:
            raise NotFoundError("Message not found")
        account = await s.get(ConnectedAccount, target.account_id)
        settings = await s.get(UserSettings, user_id)
        thread_msgs = list((await s.execute(
            select(EmailMessage).where(EmailMessage.thread_id == target.thread_id, EmailMessage.is_deleted.is_(False))
            .order_by(EmailMessage.internal_date.desc()).limit(12)
        )).scalars().all())[::-1]
        pref_tone = None
        if target.from_address:
            pref_tone = (await s.execute(
                select(ContactPreference.preferred_tone).join(Contact, Contact.id == ContactPreference.contact_id)
                .where(Contact.user_id == user_id, Contact.email == target.from_address)
            )).scalar_one_or_none()
    assert account is not None
    if target.is_sent:
        to = [a["email"] for a in target.to_addresses]
        cc = [a["email"] for a in target.cc_addresses]
    else:
        to = [target.reply_to or target.from_address or ""]
        cc = []
    to = validate_addresses([a for a in to if a and a != account.email_address], "to")
    if not to:
        raise AppError("Could not determine a reply recipient", code="invalid_recipient")

    body, model, notes, placeholders, source = "", None, None, [], "user"
    if use_ai:
        try:
            out, model = await _generate_body(llm, user_id, account.email_address, thread_msgs, target, tone,
                                              custom_tone, instructions, settings.timezone if settings else "UTC",
                                              pref_tone)
        except LLMError as exc:
            raise AppError(
                f"AI drafting is unavailable ({exc.code}). You can start a blank draft instead.",
                code="llm_unavailable",
            ) from exc
        body, notes, placeholders, source = out.body, out.notes_for_user, out.placeholders, "ai"

    async with system_session() as s:
        draft = Draft(user_id=user_id, account_id=account.id, thread_id=target.thread_id,
                      reply_to_message_id=target.id, to_addresses=to, cc_addresses=cc,
                      subject=reply_subject(target.subject), body=body, tone=tone, custom_tone=custom_tone,
                      source=source, model=model)
        s.add(draft)
        await s.flush()
        s.add(DraftVersion(draft_id=draft.id, user_id=user_id, version_no=1, subject=draft.subject, body=body,
                           tone=tone, source=source, model=model))
        record_audit(s, user_id=user_id, event="draft.created", entity_type="draft", entity_id=draft.id,
                     details={"source": source, "tone": tone, "placeholders": len(placeholders)})
        await s.flush()
        await s.refresh(draft)
        draft._notes = notes  # type: ignore[attr-defined]
        draft._placeholders = placeholders  # type: ignore[attr-defined]
        return draft


async def regenerate_draft(user_id: UUID, draft_id: UUID, tone: str, custom_tone: str | None,
                           instructions: str | None, llm: LLMService | None = None) -> Draft:
    llm = llm or get_llm_service()
    tone_instruction(tone, custom_tone)
    async with system_session() as s:
        draft = await s.get(Draft, draft_id)
        if draft is None or draft.user_id != user_id:
            raise NotFoundError("Draft not found")
        if draft.status == DraftStatus.sent:
            raise ConflictError("Sent drafts cannot be changed")
        if draft.reply_to_message_id is None:
            raise AppError("Draft is not linked to a message", code="invalid_draft")
        target = await s.get(EmailMessage, draft.reply_to_message_id)
        account = await s.get(ConnectedAccount, draft.account_id)
        settings = await s.get(UserSettings, user_id)
        thread_msgs = list((await s.execute(
            select(EmailMessage).where(EmailMessage.thread_id == draft.thread_id)
            .order_by(EmailMessage.internal_date.desc()).limit(12)
        )).scalars().all())[::-1]
    assert target is not None and account is not None
    try:
        out, model = await _generate_body(llm, user_id, account.email_address, thread_msgs, target, tone, custom_tone,
                                          instructions, settings.timezone if settings else "UTC", None)
    except LLMError as exc:
        raise AppError(f"AI drafting is unavailable ({exc.code})", code="llm_unavailable") from exc
    return await _apply_update(user_id, draft_id, {"body": out.body, "tone": tone, "custom_tone": custom_tone},
                               None, source="ai", model=model)


async def _apply_update(user_id: UUID, draft_id: UUID, changes: dict[str, Any], expected_version: int | None,
                        source: str, model: str | None = None) -> Draft:
    async with system_session() as s:
        draft = (await s.execute(select(Draft).where(Draft.id == draft_id).with_for_update())).scalar_one_or_none()
        if draft is None or draft.user_id != user_id:
            raise NotFoundError("Draft not found")
        if draft.status in (DraftStatus.sent, DraftStatus.discarded):
            raise ConflictError(f"Draft is {draft.status} and cannot be edited")
        if expected_version is not None and draft.version != expected_version:
            raise ConflictError("Draft was modified elsewhere; reload and try again", code="version_conflict",
                                details={"current_version": draft.version})
        content_changed = any(k in changes and changes[k] != getattr(draft, k) for k in ("subject", "body"))
        new_version_no = draft.current_version_no + 1 if content_changed else draft.current_version_no
        values = {**changes, "current_version_no": new_version_no}
        if source == "ai":
            values["model"] = model
        await s.execute(update(Draft).where(Draft.id == draft_id).values(**values))
        if content_changed:
            s.add(DraftVersion(draft_id=draft_id, user_id=user_id, version_no=new_version_no,
                               subject=changes.get("subject", draft.subject), body=changes.get("body", draft.body),
                               tone=changes.get("tone", draft.tone), source=source, model=model))
        record_audit(s, user_id=user_id, event="draft.updated", entity_type="draft", entity_id=draft_id,
                     details={"fields": sorted(changes), "source": source})
        await s.flush()
        refreshed = (await s.execute(select(Draft).where(Draft.id == draft_id)
                                     .execution_options(populate_existing=True))).scalar_one()
        return refreshed


async def update_draft(user_id: UUID, draft_id: UUID, *, expected_version: int, to: list[str] | None = None,
                       cc: list[str] | None = None, subject: str | None = None, body: str | None = None,
                       tone: str | None = None) -> Draft:
    changes: dict[str, Any] = {}
    if to is not None:
        changes["to_addresses"] = validate_addresses(to, "to")
        if not changes["to_addresses"]:
            raise AppError("At least one recipient is required", code="invalid_recipient")
    if cc is not None:
        changes["cc_addresses"] = validate_addresses(cc, "cc")
    if subject is not None:
        if "\n" in subject or "\r" in subject:
            raise AppError("Subject cannot contain line breaks", code="invalid_subject")
        changes["subject"] = subject.strip()[:998]
    if body is not None:
        changes["body"] = body[:50_000]
    if tone is not None:
        changes["tone"] = tone
    if not changes:
        raise AppError("No changes supplied", code="no_changes")
    return await _apply_update(user_id, draft_id, changes, expected_version, source="user")


async def discard_draft(user_id: UUID, draft_id: UUID) -> None:
    async with system_session() as s:
        draft = await s.get(Draft, draft_id, with_for_update=True)
        if draft is None or draft.user_id != user_id:
            raise NotFoundError("Draft not found")
        if draft.status == DraftStatus.sent:
            raise ConflictError("Sent drafts cannot be discarded")
        from app.db.models import ActionApproval, ApprovalState

        await s.execute(
            update(ActionApproval)
            .where(ActionApproval.draft_id == draft_id,
                   ActionApproval.state.in_([ApprovalState.PROPOSED, ApprovalState.PENDING_APPROVAL,
                                             ApprovalState.APPROVED]))
            .values(state=ApprovalState.CANCELLED, decided_at=func.now(), decision_reason="draft_discarded")
        )
        draft.status = DraftStatus.discarded
        record_audit(s, user_id=user_id, event="draft.discarded", entity_type="draft", entity_id=draft_id)


async def thread_participants(thread_id: UUID | None) -> set[str]:
    if thread_id is None:
        return set()
    async with system_session() as s:
        rows = (await s.execute(select(EmailMessage.from_address, EmailMessage.to_addresses, EmailMessage.cc_addresses)
                                .where(EmailMessage.thread_id == thread_id))).all()
    people: set[str] = set()
    for frm, to, cc in rows:
        if frm:
            people.add(frm.lower())
        for a in [*(to or []), *(cc or [])]:
            if a.get("email"):
                people.add(a["email"].lower())
    return people

