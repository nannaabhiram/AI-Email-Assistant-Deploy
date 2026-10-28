"""Idempotent persistence of parsed Gmail messages."""

from __future__ import annotations

from dataclasses import asdict
from datetime import datetime
from uuid import UUID

from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    Contact,
    EmailAttachment,
    EmailMessage,
    EmailThread,
    SearchDocument,
)
from app.gmail.parser import ParsedMessage


async def upsert_thread(session: AsyncSession, user_id: UUID, account_id: UUID, msg: ParsedMessage) -> UUID:
    stmt = (
        pg_insert(EmailThread)
        .values(
            user_id=user_id,
            account_id=account_id,
            gmail_thread_id=msg.gmail_thread_id,
            subject=msg.subject,
            snippet=msg.snippet,
            last_message_at=msg.internal_date,
        )
        .on_conflict_do_update(
            index_elements=["account_id", "gmail_thread_id"],
            set_={"updated_at": func.now()},
        )
        .returning(EmailThread.id)
    )
    return (await session.execute(stmt)).scalar_one()


async def upsert_message(
    session: AsyncSession, user_id: UUID, account_id: UUID, msg: ParsedMessage
) -> tuple[UUID, bool]:
    """Insert or refresh a message. Returns (message_id, created)."""
    existing = (
        await session.execute(
            select(EmailMessage.id).where(
                EmailMessage.account_id == account_id, EmailMessage.gmail_message_id == msg.gmail_message_id
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        await session.execute(
            update(EmailMessage)
            .where(EmailMessage.id == existing)
            .values(label_ids=msg.label_ids, is_unread=msg.is_unread, is_deleted=False)
        )
        return existing, False

    thread_id = await upsert_thread(session, user_id, account_id, msg)
    values = dict(
        user_id=user_id,
        account_id=account_id,
        thread_id=thread_id,
        gmail_message_id=msg.gmail_message_id,
        gmail_thread_id=msg.gmail_thread_id,
        rfc822_message_id=msg.rfc822_message_id,
        in_reply_to=msg.in_reply_to,
        references_header=msg.references,
        from_address=msg.from_address.email if msg.from_address else None,
        from_name=msg.from_address.name if msg.from_address else None,
        reply_to=msg.reply_to.email if msg.reply_to else None,
        to_addresses=[a.as_dict() for a in msg.to],
        cc_addresses=[a.as_dict() for a in msg.cc],
        bcc_addresses=[a.as_dict() for a in msg.bcc],
        subject=msg.subject,
        snippet=msg.snippet,
        body_text=msg.body_text,
        has_html=msg.has_html,
        label_ids=msg.label_ids,
        is_unread=msg.is_unread,
        is_sent=msg.is_sent,
        internal_date=msg.internal_date,
        size_estimate=msg.size_estimate,
        headers=msg.headers,
        links=[asdict(link) for link in msg.links],
        calendar_data="\n".join(msg.calendar_parts)[:100_000] or None,
        content_hash=msg.content_hash(),
        has_attachments=bool(msg.attachments),
    )
    stmt = (
        pg_insert(EmailMessage)
        .values(**values)
        .on_conflict_do_nothing(index_elements=["account_id", "gmail_message_id"])
        .returning(EmailMessage.id)
    )
    message_id = (await session.execute(stmt)).scalar_one_or_none()
    if message_id is None:  # concurrent insert won the race
        message_id = (
            await session.execute(
                select(EmailMessage.id).where(
                    EmailMessage.account_id == account_id, EmailMessage.gmail_message_id == msg.gmail_message_id
                )
            )
        ).scalar_one()
        return message_id, False

    for att in msg.attachments:
        await session.execute(
            pg_insert(EmailAttachment)
            .values(
                user_id=user_id,
                message_id=message_id,
                part_id=att.part_id,
                filename=att.filename,
                mime_type=att.mime_type,
                size_bytes=att.size_bytes or (len(att.inline_data) if att.inline_data else 0),
                extraction={"gmail_attachment_id": att.gmail_attachment_id} if att.gmail_attachment_id else {},
            )
            .on_conflict_do_nothing(index_elements=["message_id", "part_id"])
        )

    sender = f"{msg.from_address.name} <{msg.from_address.email}>" if msg.from_address else ""
    await session.execute(
        pg_insert(SearchDocument)
        .values(
            user_id=user_id,
            message_id=message_id,
            attachment_id=None,
            title=msg.subject,
            content=f"{sender}\n{msg.body_text[:150_000]}",
        )
        .on_conflict_do_nothing()
    )
    await _touch_contacts(session, user_id, msg)
    return message_id, True


async def _touch_contacts(session: AsyncSession, user_id: UUID, msg: ParsedMessage) -> None:
    if msg.is_sent:
        people = [(a.email, a.name) for a in [*msg.to, *msg.cc]]
        for email, name in people[:50]:
            await _upsert_contact(session, user_id, email, name, outbound_at=msg.internal_date)
    elif msg.from_address:
        await _upsert_contact(
            session, user_id, msg.from_address.email, msg.from_address.name, inbound_at=msg.internal_date
        )


async def _upsert_contact(
    session: AsyncSession, user_id: UUID, email: str, name: str,
    inbound_at: datetime | None = None, outbound_at: datetime | None = None,
) -> None:
    stmt = pg_insert(Contact).values(
        user_id=user_id,
        email=email,
        display_name=name or None,
        domain=email.split("@")[-1],
        inbound_count=1 if inbound_at else 0,
        outbound_count=1 if outbound_at else 0,
        last_inbound_at=inbound_at,
        last_outbound_at=outbound_at,
    )
    excluded = stmt.excluded
    stmt = stmt.on_conflict_do_update(
        index_elements=["user_id", "email"],
        set_={
            "display_name": func.coalesce(Contact.display_name, excluded.display_name),
            "inbound_count": Contact.inbound_count + excluded.inbound_count,
            "outbound_count": Contact.outbound_count + excluded.outbound_count,
            "last_inbound_at": func.greatest(Contact.last_inbound_at, excluded.last_inbound_at),
            "last_outbound_at": func.greatest(Contact.last_outbound_at, excluded.last_outbound_at),
        },
    )
    await session.execute(stmt)


async def refresh_thread_aggregates(session: AsyncSession, thread_ids: set[UUID]) -> None:
    for thread_id in thread_ids:
        rows = (
            await session.execute(
                select(EmailMessage.internal_date, EmailMessage.from_address, EmailMessage.subject,
                       EmailMessage.snippet)
                .where(EmailMessage.thread_id == thread_id, EmailMessage.is_deleted.is_(False))
                .order_by(EmailMessage.internal_date)
            )
        ).all()
        if not rows:
            continue
        participants = sorted({r.from_address for r in rows if r.from_address})[:50]
        await session.execute(
            update(EmailThread)
            .where(EmailThread.id == thread_id)
            .values(
                message_count=len(rows),
                last_message_at=rows[-1].internal_date,
                subject=rows[0].subject,
                snippet=rows[-1].snippet,
                participants=participants,
            )
        )
