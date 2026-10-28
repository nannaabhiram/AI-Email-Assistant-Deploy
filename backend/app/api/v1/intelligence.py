"""Search, briefings, attachments, organization suggestions and analytics."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Query
from sqlalchemy import func, select, text

from app.analysis.search import natural_language_search
from app.api.deps import CurrentUserDep, Limit, Offset, SensitiveUserDep
from app.api.schemas import (
    AttachmentOut,
    BriefingOut,
    JobRef,
    Page,
    SearchIn,
    SearchOut,
)
from app.db.models import BriefingRun, EmailAttachment
from app.db.session import system_session, user_session
from app.errors import NotFoundError
from app.jobs.queue import enqueue

router = APIRouter(prefix="/api/v1", tags=["intelligence"])


def _jsonable(row: dict[str, Any]) -> dict[str, Any]:
    return {k: (str(v) if isinstance(v, UUID) else v) for k, v in row.items()}


@router.post("/search", response_model=SearchOut, summary="Natural-language mailbox search")
async def search(body: SearchIn, user: SensitiveUserDep) -> SearchOut:
    async with user_session(user.id) as s:
        result = await natural_language_search(s, user.id, body.query, limit=body.limit, offset=body.offset)
    return SearchOut(target=result.target, parser=result.parser, filters=result.filters,
                     results=[_jsonable(r) for r in result.results])


# --- Briefings ---------------------------------------------------------------------------
@router.get("/briefings", response_model=Page[BriefingOut])
async def list_briefings(user: CurrentUserDep, limit: Limit = 14, offset: Offset = 0) -> Page[BriefingOut]:
    async with user_session(user.id) as s:
        total = (await s.execute(select(func.count()).select_from(BriefingRun).where(BriefingRun.user_id == user.id))).scalar_one()
        rows = (await s.execute(select(BriefingRun).where(BriefingRun.user_id == user.id)
                                .order_by(BriefingRun.briefing_date.desc()).limit(limit).offset(offset))).scalars().all()
    return Page(items=[BriefingOut.model_validate(r) for r in rows], total=total, limit=limit, offset=offset)


@router.get("/briefings/latest", response_model=BriefingOut | None)
async def latest_briefing(user: CurrentUserDep) -> BriefingOut | None:
    async with user_session(user.id) as s:
        row = (await s.execute(select(BriefingRun).where(BriefingRun.user_id == user.id)
                               .order_by(BriefingRun.briefing_date.desc()).limit(1))).scalar_one_or_none()
    return BriefingOut.model_validate(row) if row else None


@router.post("/briefings/generate", response_model=JobRef, status_code=202)
async def generate(user: SensitiveUserDep) -> JobRef:
    async with system_session() as s:
        job_id = await enqueue(s, "generate_briefing", {"user_id": str(user.id)}, user_id=user.id,
                               dedupe_key=f"briefing-manual:{user.id}", priority=5)
    return JobRef(job_id=job_id, status="queued" if job_id else "already_queued")


# --- Attachments -------------------------------------------------------------------------
def _att_out(a: EmailAttachment) -> AttachmentOut:
    out = AttachmentOut.model_validate(a)
    out.stored = bool(a.storage_path)
    out.extraction = {k: v for k, v in (a.extraction or {}).items() if k != "gmail_attachment_id"}
    return out


@router.get("/attachments", response_model=Page[AttachmentOut])
async def list_attachments(user: CurrentUserDep, limit: Limit = 50, offset: Offset = 0,
                           status: str | None = Query(default=None, max_length=30)) -> Page[AttachmentOut]:
    conds = [EmailAttachment.user_id == user.id]
    if status:
        conds.append(EmailAttachment.extraction_status == status)
    async with user_session(user.id) as s:
        total = (await s.execute(select(func.count()).select_from(EmailAttachment).where(*conds))).scalar_one()
        rows = (await s.execute(select(EmailAttachment).where(*conds).order_by(EmailAttachment.created_at.desc())
                                .limit(limit).offset(offset))).scalars().all()
    return Page(items=[_att_out(a) for a in rows], total=total, limit=limit, offset=offset)


@router.get("/attachments/{attachment_id}")
async def get_attachment(attachment_id: UUID, user: CurrentUserDep) -> dict[str, Any]:
    async with user_session(user.id) as s:
        a = await s.get(EmailAttachment, attachment_id)
        if a is None:
            raise NotFoundError("Attachment not found")
    return {**_att_out(a).model_dump(mode="json"), "extracted_text_preview": (a.extracted_text or "")[:5000]}


@router.post("/attachments/{attachment_id}/extract", response_model=JobRef, status_code=202)
async def extract(attachment_id: UUID, user: SensitiveUserDep) -> JobRef:
    async with system_session() as s:
        a = await s.get(EmailAttachment, attachment_id)
        if a is None or a.user_id != user.id:
            raise NotFoundError("Attachment not found")
        a.extraction_status = "pending"
        job_id = await enqueue(s, "extract_attachment", {"attachment_id": str(attachment_id), "user_id": str(user.id)},
                               user_id=user.id, dedupe_key=f"attachment:{attachment_id}", priority=5)
    return JobRef(job_id=job_id, status="queued" if job_id else "already_queued")


@router.get("/attachments/{attachment_id}/download-url")
async def download_url(attachment_id: UUID, user: SensitiveUserDep) -> dict[str, Any]:
    from app.config import get_settings
    from app.services.storage import signed_url

    async with user_session(user.id) as s:
        a = await s.get(EmailAttachment, attachment_id)
    if a is None:
        raise NotFoundError("Attachment not found")
    if not a.storage_path:
        raise NotFoundError("Attachment is not stored; enable attachment storage and re-extract")
    if not a.storage_path.startswith(f"{user.id}/"):
        raise NotFoundError("Attachment not found")
    return {"url": await signed_url(a.storage_path), "expires_in": get_settings().signed_url_ttl_seconds}


# --- Inbox organization suggestions ------------------------------------------------------
@router.get("/organize/suggestions", summary="Suggested label/archive actions (nothing is applied)")
async def organize_suggestions(user: CurrentUserDep) -> dict[str, Any]:
    async with user_session(user.id) as s:
        newsletter_rows = (await s.execute(text("""
            select m.from_address, max(m.from_name) as from_name, count(*) as n, array_agg(m.id) as ids
              from email_messages m join email_analysis a on a.message_id = m.id
             where m.user_id = :uid and a.is_newsletter and 'INBOX' = any(m.label_ids) and not m.is_deleted
               and m.internal_date < now() - interval '3 days'
             group by m.from_address having count(*) >= 2 order by n desc limit 20"""), {"uid": user.id})).mappings().all()
        category_rows = (await s.execute(text("""
            select a.category, count(*) as n, array_agg(m.id) as ids
              from email_messages m join email_analysis a on a.message_id = m.id
             where m.user_id = :uid and a.category in ('finance', 'meeting', 'security') and not m.is_deleted
               and m.internal_date > now() - interval '30 days'
             group by a.category"""), {"uid": user.id})).mappings().all()
        read_low = (await s.execute(text("""
            select array_agg(m.id) as ids, count(*) as n
              from email_messages m join email_analysis a on a.message_id = m.id
             where m.user_id = :uid and a.effective_priority = 'LOW' and not m.is_unread
               and 'INBOX' = any(m.label_ids) and not m.is_deleted and m.internal_date < now() - interval '7 days'"""),
            {"uid": user.id})).mappings().one()
    suggestions: list[dict[str, Any]] = []
    for r in newsletter_rows:
        suggestions.append({
            "action_type": "archive", "message_ids": [str(i) for i in r["ids"][:200]],
            "title": f"Archive {r['n']} newsletter(s) from {r['from_name'] or r['from_address']}",
            "reason": "Older newsletters still in the inbox", "label_name": None,
        })
    for r in category_rows:
        label = {"finance": "MailPilot/Finance", "meeting": "MailPilot/Meetings", "security": "MailPilot/Security"}[r["category"]]
        suggestions.append({
            "action_type": "apply_label", "message_ids": [str(i) for i in r["ids"][:200]],
            "title": f"Label {r['n']} {r['category']} email(s) as “{label}”",
            "reason": f"Detected {r['category']} emails in the last 30 days", "label_name": label,
        })
    if read_low["n"]:
        suggestions.append({
            "action_type": "archive", "message_ids": [str(i) for i in (read_low["ids"] or [])[:200]],
            "title": f"Archive {read_low['n']} read low-priority email(s) older than 7 days",
            "reason": "Read, low priority and no longer recent", "label_name": None,
        })
    return {"suggestions": suggestions,
            "note": "Suggestions are previews. Creating one produces an approval request; nothing changes in Gmail "
                    "until you approve it."}


# --- Analytics -----------------------------------------------------------------------------
@router.get("/analytics", summary="Mailbox and AI analytics")
async def analytics(user: CurrentUserDep, days: int = Query(default=30, ge=1, le=365)) -> dict[str, Any]:
    since = datetime.now(UTC) - timedelta(days=days)
    p = {"uid": user.id, "since": since}
    async with user_session(user.id) as s:
        volume = (await s.execute(text("""
            select date_trunc('day', m.internal_date)::date as day,
                   count(*) filter (where not m.is_sent) as received, count(*) filter (where m.is_sent) as sent
              from email_messages m where m.user_id = :uid and m.internal_date >= :since and not m.is_deleted
             group by 1 order by 1"""), p)).mappings().all()
        priority = (await s.execute(text("""
            select a.effective_priority as priority, count(*) as n from email_analysis a
              join email_messages m on m.id = a.message_id
             where a.user_id = :uid and m.internal_date >= :since and not m.is_sent group by 1"""), p)).mappings().all()
        sources = (await s.execute(text("""
            select a.source, count(*) as n from email_analysis a join email_messages m on m.id = a.message_id
             where a.user_id = :uid and m.internal_date >= :since group by 1"""), p)).mappings().all()
        overrides = (await s.execute(text("""
            select previous_value ->> 'priority' as model_priority, new_value ->> 'override' as user_priority, count(*) as n
              from feedback where user_id = :uid and kind = 'priority_override' and created_at >= :since
             group by 1, 2"""), p)).mappings().all()
        high_total = (await s.execute(text("""
            select count(*) from email_analysis a join email_messages m on m.id = a.message_id
             where a.user_id = :uid and a.priority = 'HIGH' and m.internal_date >= :since"""), p)).scalar_one()
        backlog = (await s.execute(text("""
            select count(*) from email_messages m join email_analysis a on a.message_id = m.id
             where m.user_id = :uid and a.reply_needed and not m.is_deleted
               and not exists (select 1 from email_messages r where r.thread_id = m.thread_id and r.is_sent
                               and r.internal_date > m.internal_date)"""), p)).scalar_one()
        response = (await s.execute(text("""
            select percentile_cont(0.5) within group (order by extract(epoch from (r.internal_date - m.internal_date)))
                   as median_seconds, count(*) as n
              from email_messages m
              join lateral (select min(x.internal_date) as internal_date from email_messages x
                             where x.thread_id = m.thread_id and x.is_sent and x.internal_date > m.internal_date) r on true
             where m.user_id = :uid and not m.is_sent and m.internal_date >= :since and r.internal_date is not null"""),
            p)).mappings().one()
        tasks = (await s.execute(text("""
            select count(*) filter (where status = 'open' and due_at < now()) as overdue,
                   count(*) filter (where status = 'open') as open, count(*) filter (where status = 'done') as done,
                   count(*) filter (where status = 'suggested') as suggested
              from tasks where user_id = :uid"""), p)).mappings().one()
        newsletters = (await s.execute(text("""
            select count(*) from email_analysis a join email_messages m on m.id = a.message_id
             where a.user_id = :uid and a.is_newsletter and m.internal_date >= :since"""), p)).scalar_one()
        llm = (await s.execute(text("""
            select task, status, count(*) as n, avg(latency_ms)::int as avg_ms,
                   percentile_cont(0.95) within group (order by latency_ms) as p95_ms
              from llm_calls where user_id = :uid and created_at >= :since group by 1, 2 order by 1, 2"""), p)).mappings().all()
    downgraded = sum(r["n"] for r in overrides if r["model_priority"] == "HIGH" and r["user_priority"] not in (None, "HIGH"))
    return {
        "range_days": days,
        "volume": [{"day": str(r["day"]), "received": r["received"], "sent": r["sent"]} for r in volume],
        "priority_distribution": {r["priority"]: r["n"] for r in priority},
        "analysis_sources": {r["source"]: r["n"] for r in sources},
        "overrides": [dict(r) for r in overrides],
        "high_priority_agreement": {
            "high_classified": high_total,
            "overridden_down": downgraded,
            "agreement_rate": round(1 - downgraded / high_total, 3) if high_total else None,
            "note": "Based only on explicit user overrides; AI scores are not verified ground truth.",
        },
        "response_backlog": backlog,
        "median_response_seconds": float(response["median_seconds"]) if response["median_seconds"] else None,
        "response_sample_size": response["n"],
        "tasks": dict(tasks),
        "newsletter_volume": newsletters,
        "llm": [{**dict(r), "p95_ms": float(r["p95_ms"]) if r["p95_ms"] is not None else None} for r in llm],
        "generated_at": datetime.now(UTC).isoformat(),
        "today": str(date.today()),
    }
