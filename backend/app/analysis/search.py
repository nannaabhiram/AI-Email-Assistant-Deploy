"""Natural-language mailbox search: NL → structured filters → scoped SQL (FTS + optional vectors)."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID
from zoneinfo import ZoneInfo

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db.models import UserSettings
from app.llm.base import LLMError
from app.llm.prompts import SEARCH_SYSTEM
from app.llm.schemas import SearchQueryOutput
from app.llm.service import LLMService, get_llm_service

STOPWORDS = set(
    "a an the of to in on for from by with about me my i is are was were be been which what where when who whom "
    "find show list give get email emails mail mails message messages that this these those any all some did do "
    "does have has had received sent someone somebody last latest recent most require requires required response "
    "reply today mentioning mention particular one please".split()
)
_AMOUNT_RE = re.compile(r"(?:₹|\$|€|£|inr|usd|rs\.?)\s?\d[\d,.]*|\d[\d,]{3,}(?:\.\d+)?", re.I)


@dataclass
class SearchResponse:
    target: str
    parser: str
    filters: dict[str, Any]
    results: list[dict[str, Any]] = field(default_factory=list)


def rule_parse(query: str) -> SearchQueryOutput:
    q = query.strip()
    lower = q.lower()
    target = "emails"
    if re.search(r"\bcommitments?\b|\bpromis(e|ed)\b|\bowe[sd]?\b|\bfollow[- ]ups?\b", lower):
        target = "commitments"
    elif re.search(r"\btasks?\b|\bto-?dos?\b", lower):
        target = "tasks"
    sender = None
    if m := re.search(r"\bfrom\s+([\w.+-]+@[\w.-]+|[A-Z][\w.-]*(?:\s+[A-Z][\w.-]*)?)", q):
        sender = m.group(1)
    amount = None
    if m := _AMOUNT_RE.search(q):
        amount = re.sub(r"[^\d.]", "", m.group(0)).rstrip(".")
    quoted = re.findall(r'"([^"]+)"', q)
    rest = re.sub(r'"[^"]+"', " ", lower)
    if sender:
        rest = rest.replace(sender.lower(), " ")
    words = [w for w in re.findall(r"[a-z0-9][a-z0-9\-]{1,}", rest) if w not in STOPWORDS and not w.isdigit()]
    if target != "emails":
        words = [w for w in words if not re.fullmatch(r"commitments?|tasks?|todos?|completed|not|haven|open", w)]
    priority = None
    has_attachment = False
    if m := re.search(r"\b(high|medium|low)[- ]priority\b", lower):
        priority = m.group(1).upper()
        words = [w for w in words if w not in {"high", "medium", "low", "priority", f"{m.group(1)}-priority"}]
    has_attachment = bool(re.search(r"(?<![a-z])attach(ments?|ed)(?![a-z])", lower))
    if has_attachment:
        words = [w for w in words if not re.fullmatch(r"attach(ments?|ed)", w)]
    return SearchQueryOutput(
        target=target,  # type: ignore[arg-type]
        keywords=[*quoted, *words][:8],
        sender=sender,
        priority=priority,  # type: ignore[arg-type]
        requires_reply=True if re.search(r"\b(require|need)s?\s+(a\s+)?(response|reply)\b|awaiting (my )?reply", lower) else None,
        due_today=True if re.search(r"\btoday\b", lower) else None,
        has_attachment=True if has_attachment else None,
        amount=amount,
        only_open=True if re.search(r"\bnot (yet )?(completed|done|finished)|\bopen\b|\bpending\b|haven'?t", lower) else None,
        latest_only=bool(re.search(r"\b(last|latest|most recent)\b", lower)),
        sort="newest" if re.search(r"\b(last|latest|most recent|recent)\b", lower) else "relevance",
    )


def _day_bounds(tz_name: str) -> tuple[datetime, datetime]:
    tz = ZoneInfo(tz_name)
    start = datetime.now(UTC).astimezone(tz).replace(hour=0, minute=0, second=0, microsecond=0)
    return start, start + timedelta(days=1)


def _iso_date(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value)
        return dt if dt.tzinfo else dt.replace(tzinfo=UTC)
    except ValueError:
        return None


async def _search_emails(session: AsyncSession, user_id: UUID, f: SearchQueryOutput, tz: str, limit: int,
                         offset: int, query_vector: str | None) -> list[dict[str, Any]]:
    where = ["m.user_id = :uid", "m.is_deleted = false"]
    params: dict[str, Any] = {"uid": user_id, "limit": limit, "offset": offset}
    rank_sql = "0"
    if f.keywords:
        params["tsq"] = " OR ".join(re.sub(r'["\\]', "", k) for k in f.keywords)
        where.append(
            "exists (select 1 from public.search_documents sd where sd.message_id = m.id and sd.user_id = :uid "
            "and sd.tsv @@ websearch_to_tsquery('english', :tsq))"
        )
        rank_sql = (
            "(select max(ts_rank(sd.tsv, websearch_to_tsquery('english', :tsq))) from public.search_documents sd "
            "where sd.message_id = m.id and sd.user_id = :uid)"
        )
    if f.sender:
        params["sender"] = f"%{f.sender.lower()}%"
        where.append("(lower(m.from_address) like :sender or lower(coalesce(m.from_name, '')) like :sender)")
    if f.amount:
        digits = re.sub(r"\D", "", f.amount.split(".")[0])
        if digits:
            params["amount"] = digits
            where.append("regexp_replace(coalesce(m.body_text, '') || ' ' || coalesce(m.subject, ''), '[^0-9]', '', 'g') like '%' || :amount || '%'")
    if f.priority:
        params["priority"] = f.priority
        where.append("a.effective_priority = cast(:priority as public.priority_level)")
    if f.requires_reply:
        where.append(
            "a.reply_needed = true and not exists (select 1 from public.email_messages r where r.thread_id = m.thread_id "
            "and r.is_sent = true and r.internal_date > m.internal_date)"
        )
    if f.requires_action:
        where.append("a.action_required = true")
    if f.has_attachment:
        where.append("m.has_attachments = true")
    if f.category:
        params["category"] = f.category
        where.append("a.category = :category")
    if f.due_today:
        start, end = _day_bounds(tz)
        params.update(day_start=start, day_end=end, reply_window=start - timedelta(days=1))
        where.append("(a.deadline_at >= :day_start and a.deadline_at < :day_end"
                     + (" or (a.reply_needed = true and m.internal_date >= :reply_window))" if f.requires_reply else ")"))
    if df := _iso_date(f.date_from):
        params["date_from"] = df
        where.append("m.internal_date >= :date_from")
    if dt := _iso_date(f.date_to):
        params["date_to"] = dt
        where.append("m.internal_date <= :date_to")

    vector_rank = "null"
    if query_vector:
        params["qvec"] = query_vector
        vector_rank = (
            "(select min(sd.embedding <=> cast(:qvec as extensions.vector)) from public.search_documents sd "
            "where sd.message_id = m.id and sd.user_id = :uid and sd.embedding is not null)"
        )
    order = {"newest": "m.internal_date desc", "oldest": "m.internal_date asc"}.get(
        f.sort, "rank desc nulls last, m.internal_date desc"
    )
    if f.latest_only:
        order, params["limit"] = "m.internal_date desc", 1
    sql = f"""
        select m.id, m.thread_id, m.subject, m.snippet, m.from_address, m.from_name, m.internal_date,
               m.is_unread, m.has_attachments, a.effective_priority as priority, a.priority_score, a.summary,
               a.deadline_at, a.reply_needed, a.risk_level, {rank_sql} as rank, {vector_rank} as distance
          from public.email_messages m
          left join public.email_analysis a on a.message_id = m.id
         where {' and '.join(where)}
         order by {order}
         limit :limit offset :offset
    """
    rows = (await session.execute(text(sql), params)).mappings().all()
    results = [dict(r) for r in rows]
    if query_vector and f.sort == "relevance" and not f.latest_only:
        # Reciprocal-rank fusion of lexical and semantic rankings.
        lex = {r["id"]: i for i, r in enumerate(results)}
        sem = {r["id"]: i for i, r in enumerate(sorted(results, key=lambda r: r["distance"] if r["distance"] is not None else 9))}
        results.sort(key=lambda r: -(1 / (60 + lex[r["id"]]) + 1 / (60 + sem[r["id"]])))
    return results


async def _search_tasks(session: AsyncSession, user_id: UUID, f: SearchQueryOutput, tz: str, limit: int,
                        offset: int) -> list[dict[str, Any]]:
    where = ["t.user_id = :uid"]
    params: dict[str, Any] = {"uid": user_id, "limit": limit, "offset": offset}
    where.append("t.status in ('open', 'suggested')" if f.only_open is not False else "true")
    for i, kw in enumerate(f.keywords[:5]):
        params[f"kw{i}"] = f"%{kw.lower()}%"
        where.append(f"(lower(t.title) like :kw{i} or lower(coalesce(t.evidence, '')) like :kw{i})")
    if f.due_today:
        start, end = _day_bounds(tz)
        params.update(day_start=start, day_end=end)
        where.append("t.due_at < :day_end")
    sql = f"""select t.id, t.title, t.status, t.due_at, t.due_date_type, t.source_message_id, t.needs_confirmation
                from public.tasks t where {' and '.join(where)}
               order by t.due_at nulls last, t.created_at desc limit :limit offset :offset"""
    return [dict(r) for r in (await session.execute(text(sql), params)).mappings().all()]


async def _search_commitments(session: AsyncSession, user_id: UUID, f: SearchQueryOutput, limit: int,
                              offset: int) -> list[dict[str, Any]]:
    where = ["c.user_id = :uid", "c.status in ('open', 'suggested')" if f.only_open is not False else "true"]
    params: dict[str, Any] = {"uid": user_id, "limit": limit, "offset": offset}
    for i, kw in enumerate(f.keywords[:5]):
        params[f"kw{i}"] = f"%{kw.lower()}%"
        where.append(f"(lower(c.description) like :kw{i} or lower(coalesce(c.counterparty, '')) like :kw{i})")
    if f.sender:
        params["sender"] = f"%{f.sender.lower()}%"
        where.append("lower(coalesce(c.counterparty, '')) like :sender")
    sql = f"""select c.id, c.description, c.direction, c.counterparty, c.status, c.due_at, c.source_message_id
                from public.commitments c where {' and '.join(where)}
               order by c.due_at nulls last, c.created_at desc limit :limit offset :offset"""
    return [dict(r) for r in (await session.execute(text(sql), params)).mappings().all()]


async def natural_language_search(
    session: AsyncSession, user_id: UUID, query: str, *, limit: int = 20, offset: int = 0,
    llm: LLMService | None = None,
) -> SearchResponse:
    llm = llm or get_llm_service()
    settings = await session.get(UserSettings, user_id)
    tz = settings.timezone if settings else "UTC"
    parser = "rules"
    filters = rule_parse(query)
    if llm.available:
        try:
            filters, _ = await llm.generate(
                task="search_parse", system_prompt=SEARCH_SYSTEM, untrusted={"search_request": query[:500]},
                trusted_context=f"Current date/time: {datetime.now(UTC).astimezone(ZoneInfo(tz)).isoformat()} ({tz}).",
                output_model=SearchQueryOutput, user_id=user_id, max_tokens=400,
            )
            parser = "llm"
        except LLMError:
            parser = "rules"

    query_vector = None
    if filters.target == "emails" and get_settings().embeddings_configured and filters.keywords:
        from app.llm.embeddings import embed, to_pgvector

        try:
            query_vector = to_pgvector((await embed([query]))[0])
        except LLMError:
            query_vector = None

    if filters.target == "tasks":
        results = await _search_tasks(session, user_id, filters, tz, limit, offset)
    elif filters.target == "commitments":
        results = await _search_commitments(session, user_id, filters, limit, offset)
    else:
        results = await _search_emails(session, user_id, filters, tz, limit, offset, query_vector)
        if not results and filters.keywords and parser == "llm":
            # LLM keywords can be too narrow; retry with the deterministic interpretation.
            fallback = rule_parse(query)
            results = await _search_emails(session, user_id, fallback, tz, limit, offset, None)
            if results:
                filters, parser = fallback, "rules_fallback"
    return SearchResponse(target=filters.target, parser=parser + ("+semantic" if query_vector else ""),
                          filters=filters.model_dump(exclude_none=True), results=results)
