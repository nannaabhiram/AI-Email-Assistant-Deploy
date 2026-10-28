"""Daily briefing generation."""

from __future__ import annotations

import json
from datetime import UTC, date, datetime, timedelta
from typing import Any
from uuid import UUID
from zoneinfo import ZoneInfo

from sqlalchemy import select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.db.models import BriefingRun, Notification, UserSettings
from app.db.session import system_session
from app.llm.base import LLMError
from app.llm.prompts import BRIEFING_SYSTEM
from app.llm.schemas import BriefingNarrativeOutput
from app.llm.service import LLMService, get_llm_service


def _rows(result: Any) -> list[dict[str, Any]]:
    return [{k: (v.isoformat() if isinstance(v, datetime | date) else str(v) if isinstance(v, UUID) else v)
             for k, v in r.items()} for r in result.mappings().all()]


async def build_briefing_content(user_id: UUID, tz_name: str, since: datetime | None) -> dict[str, Any]:
    tz = ZoneInfo(tz_name)
    now = datetime.now(UTC)
    day_start = now.astimezone(tz).replace(hour=0, minute=0, second=0, microsecond=0)
    day_end = day_start + timedelta(days=1)
    since = since or now - timedelta(days=1)
    p = {"uid": user_id, "now": now, "day_start": day_start, "day_end": day_end, "since": since,
         "week": now + timedelta(days=7), "three_days_ago": now - timedelta(days=3), "week_ago": now - timedelta(days=7)}
    async with system_session() as s:
        top = _rows(await s.execute(text("""
            select m.id, m.subject, m.from_name, m.from_address, m.internal_date, a.summary, a.priority_score,
                   a.effective_priority as priority, a.suggested_action, a.risk_level
              from email_messages m join email_analysis a on a.message_id = m.id
             where m.user_id = :uid and m.is_deleted = false and a.effective_priority = 'HIGH'
               and m.internal_date >= :three_days_ago and 'INBOX' = any(m.label_ids)
             order by a.priority_score desc, m.internal_date desc limit 6"""), p))
        due_today = _rows(await s.execute(text("""
            select id, title, due_at, status, source_message_id from tasks
             where user_id = :uid and status in ('open', 'suggested') and due_at >= :day_start and due_at < :day_end
             order by due_at"""), p))
        upcoming = _rows(await s.execute(text("""
            select id, title, due_at, status, source_message_id from tasks
             where user_id = :uid and status in ('open', 'suggested') and due_at >= :day_end and due_at < :week
             order by due_at limit 10"""), p))
        overdue = _rows(await s.execute(text("""
            select id, title, due_at, status, source_message_id from tasks
             where user_id = :uid and status = 'open' and due_at < :now order by due_at limit 10"""), p))
        overdue_commitments = _rows(await s.execute(text("""
            select id, description, direction, counterparty, due_at from commitments
             where user_id = :uid and status = 'open' and due_at < :now order by due_at limit 10"""), p))
        awaiting = _rows(await s.execute(text("""
            select m.id, m.subject, m.from_name, m.from_address, m.internal_date from email_messages m
              join email_analysis a on a.message_id = m.id
             where m.user_id = :uid and a.reply_needed and m.is_deleted = false
               and m.internal_date >= :week_ago
               and not exists (select 1 from email_messages r where r.thread_id = m.thread_id and r.is_sent
                               and r.internal_date > m.internal_date)
             order by m.internal_date desc limit 10"""), p))
        meetings = _rows(await s.execute(text("""
            select id, title, start_at, location, conference_url, message_id from meetings
             where user_id = :uid and status = 'detected'
               and ((start_at >= :now and start_at < :week) or (start_at is null and created_at >= :since))
             order by start_at nulls last limit 10"""), p))
        changes = (await s.execute(text("""
            select count(*) filter (where m.internal_date >= :since) as new_messages,
                   count(*) filter (where m.internal_date >= :since and a.effective_priority = 'HIGH') as new_high,
                   count(*) filter (where m.internal_date >= :since and a.risk_level in ('medium', 'high')) as new_risky
              from email_messages m left join email_analysis a on a.message_id = m.id
             where m.user_id = :uid and m.is_deleted = false"""), p)).mappings().one()
        completed = (await s.execute(text(
            "select count(*) from tasks where user_id = :uid and status = 'done' and completed_at >= :since"), p)).scalar_one()
        approvals = (await s.execute(text(
            "select count(*) from action_approvals where user_id = :uid and state = 'PENDING_APPROVAL'"), p)).scalar_one()

    recommended: list[str] = []
    if overdue:
        recommended.append(f"Resolve {len(overdue)} overdue task(s), starting with “{overdue[0]['title']}”.")
    if due_today:
        recommended.append(f"Complete {len(due_today)} task(s) due today.")
    if awaiting:
        recommended.append(f"Reply to {len(awaiting)} message(s) awaiting your response.")
    if any(t.get("risk_level") in {"high", "medium"} for t in top) or changes["new_risky"]:
        recommended.append("Review flagged suspicious emails before acting on them.")
    if approvals:
        recommended.append(f"Review {approvals} pending approval(s).")
    return {
        "generated_at": now.isoformat(), "timezone": tz_name, "since": since.isoformat(),
        "top_emails": top, "due_today": due_today, "upcoming": upcoming, "overdue_tasks": overdue,
        "overdue_commitments": overdue_commitments, "awaiting_reply": awaiting, "meetings": meetings,
        "changes": {**dict(changes), "tasks_completed": completed}, "pending_approvals": approvals,
        "recommended_actions": recommended,
    }


async def generate_briefing(user_id: UUID, llm: LLMService | None = None, briefing_date: date | None = None) -> BriefingRun:
    llm = llm or get_llm_service()
    async with system_session() as s:
        settings = await s.get(UserSettings, user_id)
        tz_name = settings.timezone if settings else "UTC"
        previous = (await s.execute(
            select(BriefingRun.created_at).where(BriefingRun.user_id == user_id, BriefingRun.status == "succeeded")
            .order_by(BriefingRun.created_at.desc()).limit(1)
        )).scalar_one_or_none()
    local_date = briefing_date or datetime.now(UTC).astimezone(ZoneInfo(tz_name)).date()
    content = await build_briefing_content(user_id, tz_name, previous)
    narrative, source = None, "rules"
    if llm.available:
        try:
            out, _ = await llm.generate(
                task="daily_briefing", system_prompt=BRIEFING_SYSTEM,
                untrusted={"briefing_data": json.dumps(content, default=str)[:20000]},
                trusted_context=f"Briefing date: {local_date} ({tz_name}).", output_model=BriefingNarrativeOutput,
                user_id=user_id, max_tokens=700,
            )
            narrative, source = f"{out.headline}\n\n{out.narrative}", "hybrid"
            content["llm_recommended_actions"] = out.recommended_actions
        except LLMError:
            pass
    async with system_session() as s:
        stmt = pg_insert(BriefingRun).values(user_id=user_id, briefing_date=local_date, status="succeeded",
                                             source=source, content=content, narrative=narrative)
        await s.execute(stmt.on_conflict_do_update(
            index_elements=["user_id", "briefing_date"],
            set_={"content": stmt.excluded.content, "narrative": stmt.excluded.narrative,
                  "source": stmt.excluded.source, "status": "succeeded", "created_at": datetime.now(UTC)},
        ))
        run = (await s.execute(select(BriefingRun).where(BriefingRun.user_id == user_id,
                                                        BriefingRun.briefing_date == local_date))).scalar_one()
        if not settings or (settings.notification_prefs or {}).get("briefing", True):
            await s.execute(pg_insert(Notification).values(
                user_id=user_id, kind="briefing", title=f"Daily briefing for {local_date:%d %b %Y}",
                body=f"{len(content['top_emails'])} important emails, {len(content['due_today'])} due today, "
                     f"{len(content['overdue_tasks'])} overdue.",
                link="/briefings", dedupe_key=f"briefing:{local_date}",
            ).on_conflict_do_nothing())
    return run
