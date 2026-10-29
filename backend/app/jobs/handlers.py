"""Background job handlers. Each handler is idempotent and safe to retry."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

from sqlalchemy import select, text, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.analysis.attachments import process_attachment
from app.analysis.briefing import generate_briefing
from app.analysis.pipeline import analyze_message
from app.analysis.summaries import summarize_thread
from app.config import get_settings
from app.db.models import (
    AccountStatus,
    AnalysisStatus,
    ConnectedAccount,
    EmailAttachment,
    EmailMessage,
    Notification,
    SearchDocument,
    SyncState,
    Task,
    UserSettings,
)
from app.db.session import system_session
from app.gmail.client import GmailAuthError, GmailRateLimitError
from app.gmail.sync import SyncSkipped, sync_account
from app.jobs.queue import enqueue
from app.logging import get_logger
from app.services.timezones import briefing_due_date

log = get_logger(__name__)


class RetryLater(Exception):
    """Defer the job without consuming an attempt (e.g. DGX temporarily unreachable)."""

    def __init__(self, seconds: int, reason: str) -> None:
        super().__init__(reason)
        self.seconds = seconds


class PermanentFailure(Exception):
    """Do not retry."""


class RetryAfter(Exception):
    """Retry with at least ``seconds`` delay; consumes an attempt (bounded by max_attempts)."""

    def __init__(self, seconds: int, reason: str) -> None:
        super().__init__(reason)
        self.seconds = seconds


Handler = Callable[[dict[str, Any]], Awaitable[dict[str, Any] | None]]


async def handle_gmail_sync(payload: dict[str, Any]) -> dict[str, Any]:
    try:
        result = await sync_account(UUID(payload["account_id"]), payload.get("mode", "auto"))
    except SyncSkipped as exc:
        return {"skipped": str(exc)}
    except GmailAuthError as exc:
        raise PermanentFailure(f"Gmail authorization required: {exc}") from exc
    except GmailRateLimitError as exc:
        # Gmail quotas recover over minutes; quick retries only burn more quota. Messages already
        # stored are kept, so the retry resumes where this attempt stopped.
        raise RetryAfter(300, f"GmailRateLimitError: {exc}") from exc
    return {"mode": result.mode, "created": result.created, "updated": result.updated, "deleted": result.deleted}


async def handle_analyze(payload: dict[str, Any]) -> dict[str, Any]:
    try:
        outcome = await analyze_message(UUID(payload["message_id"]))
    except LookupError as exc:
        raise PermanentFailure(str(exc)) from exc
    if outcome.llm_pending:
        # A labelled rule-based result is already stored; retry the LLM analysis later.
        raise RetryLater(300, f"Remote inference unavailable ({outcome.llm_error}); rule-based result stored")
    async with system_session() as s:
        msg = await s.get(EmailMessage, UUID(payload["message_id"]))
        settings = await s.get(UserSettings, msg.user_id) if msg else None
        if msg and settings and settings.attachment_auto_extract and msg.has_attachments:
            ids = (await s.execute(select(EmailAttachment.id).where(
                EmailAttachment.message_id == msg.id, EmailAttachment.extraction_status == "not_requested"))).scalars()
            for att_id in ids:
                await enqueue(s, "extract_attachment", {"attachment_id": str(att_id), "user_id": str(msg.user_id)},
                              user_id=msg.user_id, dedupe_key=f"attachment:{att_id}", priority=80)
    return {"source": outcome.source, "priority": outcome.priority}


async def handle_summarize_thread(payload: dict[str, Any]) -> dict[str, Any]:
    summary = await summarize_thread(UUID(payload["user_id"]), UUID(payload["thread_id"]))
    return {"source": summary.source}


async def handle_extract_attachment(payload: dict[str, Any]) -> dict[str, Any]:
    att = await process_attachment(UUID(payload["user_id"]), UUID(payload["attachment_id"]))
    return {"status": att.extraction_status}


async def handle_execute_action(payload: dict[str, Any]) -> dict[str, Any]:
    from app.actions.engine import execute_approval

    approval = await execute_approval(UUID(payload["approval_id"]))
    return {"state": approval.state.value if approval else "missing"}


async def handle_briefing(payload: dict[str, Any]) -> dict[str, Any]:
    run = await generate_briefing(UUID(payload["user_id"]))
    return {"briefing_id": str(run.id), "source": run.source}


async def handle_embed(payload: dict[str, Any]) -> dict[str, Any]:
    from app.llm.base import LLMError
    from app.llm.embeddings import embed, to_pgvector

    settings = get_settings()
    if not settings.embeddings_configured:
        return {"skipped": "embeddings not configured"}
    async with system_session() as s:
        docs = (await s.execute(select(SearchDocument.id, SearchDocument.title, SearchDocument.content)
                                .where(SearchDocument.embedding_model.is_(None)).limit(32))).all()
    if not docs:
        return {"embedded": 0}
    try:
        vectors = await embed([f"{d.title}\n{d.content[:4000]}" for d in docs])
    except LLMError as exc:
        raise RetryLater(600, f"embedding endpoint unavailable: {exc.code}") from exc
    async with system_session() as s:
        for d, vec in zip(docs, vectors, strict=True):
            await s.execute(text("update public.search_documents set embedding = cast(:v as extensions.vector), "
                                 "embedding_model = :m where id = :id"),
                            {"v": to_pgvector(vec), "m": settings.embedding_model, "id": d.id})
        if len(docs) == 32:
            await enqueue(s, "embed_documents", {}, dedupe_key="embed", priority=200)
    return {"embedded": len(docs)}


async def handle_reminders(_: dict[str, Any]) -> dict[str, Any]:
    now = datetime.now(UTC)
    created = 0
    async with system_session() as s:
        due = (await s.execute(select(Task).where(
            Task.status == "open", Task.reminded_at.is_(None),
            ((Task.reminder_at.is_not(None)) & (Task.reminder_at <= now)) | ((Task.due_at.is_not(None)) & (Task.due_at <= now)),
        ).limit(500))).scalars().all()
        for task in due:
            overdue = task.due_at is not None and task.due_at <= now
            await s.execute(pg_insert(Notification).values(
                user_id=task.user_id, kind="reminder",
                title=("Overdue: " if overdue else "Due soon: ") + task.title[:150],
                body=f"Due {task.due_at.isoformat()}" if task.due_at else None,
                link="/tasks", dedupe_key=f"task:{task.id}:{'overdue' if overdue else 'reminder'}",
            ).on_conflict_do_nothing())
            task.reminded_at = now
            created += 1
    return {"reminders": created}


async def handle_retention(_: dict[str, Any]) -> dict[str, Any]:
    async with system_session() as s:
        result = (await s.execute(text("select public.purge_expired_data()"))).scalar_one()
    return dict(result)


HANDLERS: dict[str, Handler] = {
    "gmail_sync": handle_gmail_sync,
    "analyze_message": handle_analyze,
    "summarize_thread": handle_summarize_thread,
    "extract_attachment": handle_extract_attachment,
    "execute_action": handle_execute_action,
    "generate_briefing": handle_briefing,
    "embed_documents": handle_embed,
    "send_reminders": handle_reminders,
    "retention_cleanup": handle_retention,
}


async def schedule_briefings(s: AsyncSession, now: datetime, user_ids: list[UUID] | None = None) -> list[UUID]:
    """Enqueue each user's daily briefing once their local briefing time has passed. Returns the users queued."""
    q = select(UserSettings).where(UserSettings.briefing_enabled.is_(True))
    if user_ids is not None:
        q = q.where(UserSettings.user_id.in_(user_ids))
    queued: list[UUID] = []
    for us in (await s.execute(q)).scalars().all():
        due = briefing_due_date(now, us.timezone, us.briefing_time)
        if due is None:
            continue
        exists = (await s.execute(text(
            "select 1 from public.briefing_runs where user_id = :u and briefing_date = :d"),
            {"u": us.user_id, "d": due})).first()
        if not exists and await enqueue(s, "generate_briefing", {"user_id": str(us.user_id)}, user_id=us.user_id,
                                        dedupe_key=f"briefing:{us.user_id}:{due}", priority=60):
            queued.append(us.user_id)
    return queued


async def schedule_periodic_jobs() -> None:
    """Enqueue recurring work. Dedupe keys make this safe to call from several workers."""
    settings = get_settings()
    now = datetime.now(UTC)
    async with system_session() as s:
        # Only accounts not attempted within the configured interval (manual syncs are separate).
        cutoff = now - timedelta(minutes=max(1, settings.sync_interval_minutes))
        accounts = (await s.execute(
            select(ConnectedAccount.id, ConnectedAccount.user_id)
            .join(SyncState, SyncState.account_id == ConnectedAccount.id, isouter=True)
            .where(ConnectedAccount.status == AccountStatus.active,
                   (SyncState.last_attempt_at.is_(None)) | (SyncState.last_attempt_at < cutoff))
        )).all()
        for account_id, user_id in accounts:
            await enqueue(s, "gmail_sync", {"account_id": str(account_id), "mode": "auto"}, user_id=user_id,
                          dedupe_key=f"sync:{account_id}", priority=20)
        await schedule_briefings(s, now)
        await enqueue(s, "send_reminders", {}, dedupe_key="reminders", priority=70)
        ran_today = (await s.execute(text(
            "select 1 from public.jobs where job_type = 'retention_cleanup' and dedupe_key = :k and status = 'succeeded'"),
            {"k": f"retention:{now.date()}"})).first()
        if not ran_today:
            await enqueue(s, "retention_cleanup", {}, dedupe_key=f"retention:{now.date()}", priority=300)
        if settings.embeddings_configured:
            await enqueue(s, "embed_documents", {}, dedupe_key="embed", priority=200)
        # Requeue analyses left pending by older workers (e.g. before a crash).
        stale = (await s.execute(select(EmailMessage.id, EmailMessage.user_id).where(
            EmailMessage.analysis_status == AnalysisStatus.pending,
            EmailMessage.created_at < now - timedelta(minutes=10)).limit(200))).all()
        for mid, uid in stale:
            await enqueue(s, "analyze_message", {"message_id": str(mid)}, user_id=uid,
                          dedupe_key=f"analyze:{mid}", priority=90)
            await s.execute(update(EmailMessage).where(EmailMessage.id == mid)
                            .values(analysis_status=AnalysisStatus.queued))
