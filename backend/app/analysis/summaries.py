"""Thread summarization (LLM with a clearly labelled extractive fallback)."""

from __future__ import annotations

import re
from datetime import UTC, datetime
from uuid import UUID
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.db.models import EmailMessage, EmailThread, ThreadSummary, UserSettings
from app.db.session import system_session
from app.errors import NotFoundError
from app.llm.base import LLMNotConfiguredError, LLMTimeoutError, LLMUnavailableError
from app.llm.prompts import SUMMARY_SYSTEM
from app.llm.schemas import ThreadSummaryOutput
from app.llm.service import LLMService, get_llm_service

MAX_MESSAGES = 25


def _extractive(messages: list[EmailMessage], subject: str) -> ThreadSummaryOutput:
    key_points: list[str] = []
    for m in messages[-6:]:
        body = re.sub(r"\s+", " ", (m.body_text or m.snippet or "")).strip()
        first = re.split(r"(?<=[.!?])\s", body, maxsplit=1)[0][:200]
        if first:
            key_points.append(f"{m.from_name or m.from_address}: {first}")
    questions = []
    for m in messages[-3:]:
        questions += [q.strip()[:200] for q in re.findall(r"[^.?!\n]{10,200}\?", m.body_text or "")][:2]
    people = {m.from_address: m.from_name for m in messages if m.from_address}
    return ThreadSummaryOutput(
        overview=f"{subject or '(no subject)'} — {len(messages)} message(s)"[:300],
        key_points=key_points[:10],
        open_questions=questions[:10],
        people=[{"name": n or e, "email": e} for e, n in list(people.items())[:20]],  # type: ignore[misc]
        facts=[],
        inferences=[],
        next_action=None,
    )


async def summarize_thread(user_id: UUID, thread_id: UUID, llm: LLMService | None = None) -> ThreadSummary:
    llm = llm or get_llm_service()
    async with system_session() as session:
        thread = await session.get(EmailThread, thread_id)
        if thread is None or thread.user_id != user_id:
            raise NotFoundError("Thread not found")
        settings = await session.get(UserSettings, user_id)
        messages = list(
            (
                await session.execute(
                    select(EmailMessage)
                    .where(EmailMessage.thread_id == thread_id, EmailMessage.is_deleted.is_(False))
                    .order_by(EmailMessage.internal_date.desc())
                    .limit(MAX_MESSAGES)
                )
            ).scalars().all()
        )
    messages.reverse()
    tz = ZoneInfo(settings.timezone if settings else "UTC")
    source, model = "rules", None
    try:
        transcript = "\n\n---\n\n".join(
            f"From: {m.from_name or ''} <{m.from_address}>{' (mailbox owner)' if m.is_sent else ''}\n"
            f"Date: {m.internal_date.astimezone(tz).isoformat()}\n\n{(m.body_text or m.snippet or '')[:4000]}"
            for m in messages
        )
        result, meta = await llm.generate(
            task="thread_summary", system_prompt=SUMMARY_SYSTEM, untrusted={"thread": transcript},
            trusted_context=f"Current date: {datetime.now(UTC).astimezone(tz).date()}. Thread subject is given "
                            f"inside the data. Messages are in chronological order.",
            output_model=ThreadSummaryOutput, user_id=user_id,
        )
        source, model = "llm", meta.model
    except (LLMUnavailableError, LLMTimeoutError, LLMNotConfiguredError):
        result = _extractive(messages, thread.subject or "")

    values = dict(
        user_id=user_id, thread_id=thread_id, source=source, model=model, overview=result.overview,
        key_points=result.key_points, decisions=result.decisions, open_questions=result.open_questions,
        tasks=[t.model_dump() for t in result.tasks], people=[p.model_dump() for p in result.people],
        facts=result.facts, inferences=result.inferences, next_action=result.next_action,
        message_count_at_summary=len(messages),
    )
    async with system_session() as session:
        stmt = pg_insert(ThreadSummary).values(**values)
        await session.execute(stmt.on_conflict_do_update(
            index_elements=["thread_id"], set_={k: stmt.excluded[k] for k in values if k not in {"user_id", "thread_id"}}
        ))
        summary = (await session.execute(select(ThreadSummary).where(ThreadSummary.thread_id == thread_id))).scalar_one()
    return summary
