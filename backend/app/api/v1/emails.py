"""Email listing, detail, (re)analysis, priority overrides, threads, newsletters, meetings."""

from __future__ import annotations

from typing import Annotated, Any, Literal
from uuid import UUID

from fastapi import APIRouter, Query
from sqlalchemy import and_, case, exists, func, or_, select, update

from app.api.deps import CurrentUserDep, Limit, Offset, SensitiveUserDep
from app.api.schemas import (
    AnalysisOut,
    AttachmentOut,
    CommitmentOut,
    EmailDetailOut,
    EmailListItemOut,
    JobRef,
    MeetingOut,
    Page,
    PriorityOverrideIn,
    TaskOut,
    ThreadOut,
    ThreadSummaryOut,
)
from app.db.models import (
    AnalysisStatus,
    Commitment,
    Contact,
    EmailAnalysis,
    EmailAttachment,
    EmailMessage,
    EmailThread,
    Feedback,
    Meeting,
    Priority,
    Task,
    ThreadSummary,
)
from app.db.session import system_session, user_session
from app.errors import NotFoundError
from app.jobs.queue import enqueue
from app.services.audit import record_audit

router = APIRouter(prefix="/api/v1", tags=["emails"])


def list_item(m: EmailMessage, a: EmailAnalysis | None, is_vip: bool = False) -> EmailListItemOut:
    return EmailListItemOut(
        id=m.id, thread_id=m.thread_id, account_id=m.account_id, subject=m.subject, snippet=m.snippet,
        from_address=m.from_address, from_name=m.from_name, internal_date=m.internal_date, is_unread=m.is_unread,
        has_attachments=m.has_attachments, label_ids=m.label_ids, analysis_status=m.analysis_status.value,
        priority=a.effective_priority.value if a else None, priority_score=a.priority_score if a else None,
        summary=a.summary if a else None, confidence=a.confidence if a else None,
        needs_review=a.needs_review if a else None, reply_needed=a.reply_needed if a else None,
        action_required=a.action_required if a else None, deadline_at=a.deadline_at if a else None,
        risk_level=a.risk_level.value if a else None, category=a.category if a else None,
        analysis_source=a.source.value if a else None, is_vip=is_vip,
    )


@router.get("/emails", response_model=Page[EmailListItemOut], summary="List emails with priority filters")
async def list_emails(
    user: CurrentUserDep,
    limit: Limit = 50,
    offset: Offset = 0,
    priority: Annotated[list[Literal["HIGH", "MEDIUM", "LOW"]] | None, Query()] = None,
    unread: bool | None = None,
    action_required: bool | None = None,
    reply_needed: bool | None = None,
    needs_review: bool | None = None,
    risky: bool | None = None,
    newsletter: bool | None = None,
    category: str | None = Query(default=None, max_length=40),
    account_id: UUID | None = None,
    label: str | None = Query(default=None, max_length=100),
    q: str | None = Query(default=None, max_length=200),
    include_sent: bool = False,
    sort: Literal["priority", "newest", "oldest", "deadline"] = "priority",
) -> Page[EmailListItemOut]:
    conds = [EmailMessage.user_id == user.id, EmailMessage.is_deleted.is_(False)]
    if not include_sent:
        conds.append(EmailMessage.is_sent.is_(False))
    if priority:
        conds.append(EmailAnalysis.effective_priority.in_(priority))
    if unread is not None:
        conds.append(EmailMessage.is_unread.is_(unread))
    if action_required is not None:
        conds.append(EmailAnalysis.action_required.is_(action_required))
    if reply_needed is not None:
        conds.append(EmailAnalysis.reply_needed.is_(reply_needed))
    if needs_review is not None:
        conds.append(EmailAnalysis.needs_review.is_(needs_review))
    if risky:
        conds.append(EmailAnalysis.risk_level.in_(["medium", "high"]))
    if newsletter is not None:
        conds.append(EmailAnalysis.is_newsletter.is_(newsletter))
    if category:
        conds.append(EmailAnalysis.category == category)
    if account_id:
        conds.append(EmailMessage.account_id == account_id)
    if label:
        conds.append(EmailMessage.label_ids.contains([label]))
    if q:
        like = f"%{q.lower()}%"
        conds.append(or_(func.lower(EmailMessage.subject).like(like), func.lower(EmailMessage.from_address).like(like),
                         func.lower(func.coalesce(EmailMessage.from_name, "")).like(like),
                         func.lower(func.coalesce(EmailMessage.snippet, "")).like(like)))
    orders: dict[str, list[Any]] = {
        "priority": [func.coalesce(EmailAnalysis.priority_score, -1).desc(), EmailMessage.internal_date.desc()],
        "newest": [EmailMessage.internal_date.desc()],
        "oldest": [EmailMessage.internal_date.asc()],
        "deadline": [EmailAnalysis.deadline_at.asc().nulls_last(), EmailMessage.internal_date.desc()],
    }
    order = orders[sort]
    if sort == "priority":
        order.insert(0, case((EmailAnalysis.effective_priority == "HIGH", 0),
                             (EmailAnalysis.effective_priority == "MEDIUM", 1),
                             (EmailAnalysis.effective_priority == "LOW", 2), else_=3))
    vip = exists().where(and_(Contact.user_id == user.id, Contact.email == EmailMessage.from_address,
                              Contact.is_vip.is_(True)))
    base = select(EmailMessage, EmailAnalysis, vip.label("is_vip")).join(
        EmailAnalysis, EmailAnalysis.message_id == EmailMessage.id, isouter=True
    ).where(*conds)
    async with user_session(user.id) as s:
        total = (await s.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
        rows = (await s.execute(base.order_by(*order).limit(limit).offset(offset))).all()
    return Page(items=[list_item(m, a, v) for m, a, v in rows], total=total, limit=limit, offset=offset)


async def _detail(s, user_id: UUID, message_id: UUID) -> EmailDetailOut:  # type: ignore[no-untyped-def]
    m = await s.get(EmailMessage, message_id)
    if m is None or m.user_id != user_id:
        raise NotFoundError("Email not found")
    analysis = (await s.execute(select(EmailAnalysis).where(EmailAnalysis.message_id == m.id))).scalar_one_or_none()
    atts = (await s.execute(select(EmailAttachment).where(EmailAttachment.message_id == m.id))).scalars().all()
    meetings = (await s.execute(select(Meeting).where(Meeting.message_id == m.id))).scalars().all()
    tasks = (await s.execute(select(Task).where(Task.source_message_id == m.id).order_by(Task.created_at))).scalars().all()
    commitments = (await s.execute(select(Commitment).where(Commitment.source_message_id == m.id))).scalars().all()
    attachments = []
    for a in atts:
        out = AttachmentOut.model_validate(a)
        out.stored = bool(a.storage_path)
        out.extraction = {k: v for k, v in (a.extraction or {}).items() if k != "gmail_attachment_id"}
        attachments.append(out)
    return EmailDetailOut(
        id=m.id, thread_id=m.thread_id, account_id=m.account_id, gmail_message_id=m.gmail_message_id,
        subject=m.subject, from_address=m.from_address, from_name=m.from_name, reply_to=m.reply_to,
        to_addresses=m.to_addresses, cc_addresses=m.cc_addresses, internal_date=m.internal_date,
        is_unread=m.is_unread, is_sent=m.is_sent, label_ids=m.label_ids, body_text=m.body_text, has_html=m.has_html,
        links=m.links, analysis_status=m.analysis_status.value,
        analysis=AnalysisOut.model_validate(analysis) if analysis else None, attachments=attachments,
        meetings=[MeetingOut.model_validate(x) for x in meetings], tasks=[TaskOut.model_validate(t) for t in tasks],
        commitments=[CommitmentOut.model_validate(c) for c in commitments],
    )


@router.get("/emails/{message_id}", response_model=EmailDetailOut)
async def get_email(message_id: UUID, user: CurrentUserDep) -> EmailDetailOut:
    async with user_session(user.id) as s:
        return await _detail(s, user.id, message_id)


@router.post("/emails/{message_id}/analyze", response_model=JobRef, status_code=202, summary="Queue (re)analysis")
async def reanalyze(message_id: UUID, user: SensitiveUserDep) -> JobRef:
    async with system_session() as s:
        m = await s.get(EmailMessage, message_id)
        if m is None or m.user_id != user.id:
            raise NotFoundError("Email not found")
        job_id = await enqueue(s, "analyze_message", {"message_id": str(message_id)}, user_id=user.id,
                               dedupe_key=f"analyze:{message_id}", priority=5)
        await s.execute(update(EmailMessage).where(EmailMessage.id == message_id)
                        .values(analysis_status=AnalysisStatus.queued))
    return JobRef(job_id=job_id, status="queued" if job_id else "already_queued")


@router.post("/emails/{message_id}/priority", response_model=AnalysisOut, summary="Override priority (feedback)")
async def override_priority(message_id: UUID, body: PriorityOverrideIn, user: CurrentUserDep) -> AnalysisOut:
    async with system_session() as s:
        analysis = (await s.execute(
            select(EmailAnalysis).where(EmailAnalysis.message_id == message_id, EmailAnalysis.user_id == user.id)
            .with_for_update()
        )).scalar_one_or_none()
        if analysis is None:
            raise NotFoundError("Email has not been analysed yet")
        previous = {"priority": analysis.priority.value, "override": getattr(analysis.user_override_priority, "value", None),
                    "score": analysis.priority_score, "source": analysis.source.value}
        analysis.user_override_priority = Priority(body.priority) if body.priority else None
        s.add(Feedback(user_id=user.id, message_id=message_id, kind="priority_override", previous_value=previous,
                       new_value={"override": body.priority}, comment=body.comment))
        record_audit(s, user_id=user.id, event="analysis.priority_override", entity_type="email_message",
                     entity_id=message_id, details={"from": previous["priority"], "to": body.priority})
        await s.flush()
        await s.refresh(analysis)
        return AnalysisOut.model_validate(analysis)


@router.get("/threads/{thread_id}", response_model=ThreadOut)
async def get_thread(thread_id: UUID, user: CurrentUserDep) -> ThreadOut:
    async with user_session(user.id) as s:
        thread = await s.get(EmailThread, thread_id)
        if thread is None or thread.user_id != user.id:
            raise NotFoundError("Thread not found")
        ids = (await s.execute(select(EmailMessage.id).where(EmailMessage.thread_id == thread_id,
                                                             EmailMessage.is_deleted.is_(False))
                               .order_by(EmailMessage.internal_date))).scalars().all()
        messages = [await _detail(s, user.id, mid) for mid in ids[-50:]]
        summary = (await s.execute(select(ThreadSummary).where(ThreadSummary.thread_id == thread_id))).scalar_one_or_none()
    return ThreadOut(
        id=thread.id, subject=thread.subject, message_count=thread.message_count, participants=thread.participants,
        last_message_at=thread.last_message_at, messages=messages,
        summary=ThreadSummaryOut.model_validate(summary) if summary else None,
        summary_stale=bool(summary and summary.message_count_at_summary < len(ids)),
    )


@router.post("/threads/{thread_id}/summarize", response_model=JobRef, status_code=202)
async def summarize(thread_id: UUID, user: SensitiveUserDep) -> JobRef:
    async with system_session() as s:
        thread = await s.get(EmailThread, thread_id)
        if thread is None or thread.user_id != user.id:
            raise NotFoundError("Thread not found")
        job_id = await enqueue(s, "summarize_thread", {"thread_id": str(thread_id), "user_id": str(user.id)},
                               user_id=user.id, dedupe_key=f"summary:{thread_id}", priority=5)
    return JobRef(job_id=job_id, status="queued" if job_id else "already_queued")


@router.get("/newsletters", summary="Newsletter digest grouped by sender")
async def newsletters(user: CurrentUserDep, days: int = Query(default=14, ge=1, le=90)) -> dict[str, object]:
    async with user_session(user.id) as s:
        rows = (await s.execute(
            select(EmailMessage.from_address, func.max(EmailMessage.from_name), func.count(),
                   func.max(EmailMessage.internal_date), func.count().filter(EmailMessage.is_unread.is_(True)),
                   func.array_agg(EmailMessage.id), func.array_agg(EmailMessage.subject))
            .join(EmailAnalysis, EmailAnalysis.message_id == EmailMessage.id)
            .where(EmailMessage.user_id == user.id, EmailAnalysis.is_newsletter.is_(True),
                   EmailMessage.is_deleted.is_(False),
                   EmailMessage.internal_date > func.now() - func.make_interval(0, 0, 0, days))
            .group_by(EmailMessage.from_address).order_by(func.count().desc()).limit(100)
        )).all()
        dupes = (await s.execute(
            select(EmailAnalysis.message_id, EmailAnalysis.duplicate_of, EmailMessage.subject, EmailMessage.from_address)
            .join(EmailMessage, EmailMessage.id == EmailAnalysis.message_id)
            .where(EmailAnalysis.user_id == user.id, EmailAnalysis.duplicate_of.is_not(None),
                   EmailMessage.is_deleted.is_(False)).limit(100)
        )).all()
    return {
        "senders": [
            {"from_address": r[0], "from_name": r[1], "count": r[2], "latest_at": r[3], "unread": int(r[4] or 0),
             "message_ids": [str(x) for x in r[5][:200]], "recent_subjects": [x for x in r[6][-5:] if x]}
            for r in rows
        ],
        "duplicates": [{"message_id": str(d[0]), "duplicate_of": str(d[1]), "subject": d[2], "from_address": d[3]}
                       for d in dupes],
        "note": "Duplicates share identical sender and normalized content within 14 days. Repeated notifications "
                "with different content are not treated as duplicates.",
    }


@router.get("/meetings", response_model=list[MeetingOut])
async def list_meetings(user: CurrentUserDep, include_dismissed: bool = False) -> list[MeetingOut]:
    async with user_session(user.id) as s:
        q = select(Meeting).where(Meeting.user_id == user.id)
        if not include_dismissed:
            q = q.where(Meeting.status == "detected")
        rows = (await s.execute(q.order_by(Meeting.start_at.asc().nulls_last(), Meeting.created_at.desc()).limit(100))).scalars().all()
    return [MeetingOut.model_validate(r) for r in rows]


@router.post("/meetings/{meeting_id}/dismiss", response_model=MeetingOut)
async def dismiss_meeting(meeting_id: UUID, user: CurrentUserDep) -> MeetingOut:
    async with user_session(user.id) as s:
        meeting = await s.get(Meeting, meeting_id)
        if meeting is None or meeting.user_id != user.id:
            raise NotFoundError("Meeting not found")
        meeting.status = "dismissed"
        await s.flush()
        return MeetingOut.model_validate(meeting)
