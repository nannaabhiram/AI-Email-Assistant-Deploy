"""Email analysis pipeline: deterministic rules + remote LLM, validated and merged."""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID
from zoneinfo import ZoneInfo

from sqlalchemy import and_, delete, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.analysis.deadlines import extract_deadlines, parse_iso_datetime
from app.analysis.meetings import DetectedMeeting, detect_text_meeting, parse_ics
from app.analysis.phishing import assess_risk, merge_flags
from app.analysis.rules import compute_rule_features
from app.analysis.scoring import blend_components, decide_priority
from app.db.models import (
    AnalysisStatus,
    Commitment,
    Contact,
    ContactPreference,
    EmailAnalysis,
    EmailAttachment,
    EmailMessage,
    Meeting,
    Task,
    UserSettings,
)
from app.db.session import system_session
from app.llm.base import (
    LLMError,
    LLMNotConfiguredError,
    LLMTimeoutError,
    LLMUnavailableError,
)
from app.llm.prompts import ANALYSIS_SYSTEM, PROMPT_VERSION
from app.llm.schemas import EmailAnalysisOutput
from app.llm.service import LLMService, get_llm_service
from app.logging import get_logger

log = get_logger(__name__)

_COMMIT_RE = re.compile(
    r"(?P<sentence>[^.!?\n]*\b(?:I will|I'll|I shall|we will|we'll|I can send|I am going to|I'm going to)\b"
    r"[^.!?\n]{5,200}[.!?]?)",
    re.I,
)


@dataclass(slots=True)
class AnalysisOutcome:
    message_id: UUID
    source: str
    priority: str
    llm_pending: bool
    llm_error: str | None = None


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[\"'“”‘’`>]", "", text.lower())).strip()


def evidence_supported(evidence: str, source_text: str) -> bool:
    """True if the quoted evidence actually appears (or nearly verbatim) in the source text."""
    ev, src = _norm(evidence), _norm(source_text)
    if not ev:
        return False
    if ev in src:
        return True
    tokens = [t for t in re.findall(r"\w+", ev) if len(t) > 2]
    if len(tokens) < 3:
        return False
    src_tokens = set(re.findall(r"\w+", src))
    return sum(t in src_tokens for t in tokens) / len(tokens) >= 0.85


def _format_email(msg: EmailMessage, tz: ZoneInfo, attachment_names: list[str]) -> str:
    to = ", ".join(a.get("email", "") for a in (msg.to_addresses or [])[:10])
    cc = ", ".join(a.get("email", "") for a in (msg.cc_addresses or [])[:10])
    return (
        f"From: {msg.from_name or ''} <{msg.from_address or ''}>\n"
        f"Reply-To: {msg.reply_to or ''}\nTo: {to}\nCc: {cc}\n"
        f"Date: {msg.internal_date.astimezone(tz).isoformat()}\n"
        f"Subject: {msg.subject or ''}\n"
        f"Attachments: {', '.join(attachment_names) or 'none'}\n"
        f"Gmail labels: {', '.join(msg.label_ids or [])}\n\n"
        f"Body:\n{msg.body_text or msg.snippet or ''}"
    )


def _rule_commitments(msg: EmailMessage, now: datetime, tz: str) -> list[dict[str, Any]]:
    body = (msg.body_text or "")[:8000]
    body = re.split(r"\n(?:On .{5,120}wrote:|-----Original Message-----)", body, maxsplit=1)[0]
    out: list[dict[str, Any]] = []
    for m in _COMMIT_RE.finditer(body):
        sentence = m.group("sentence").strip()
        due = extract_deadlines(sentence, now, tz)
        out.append({
            "direction": "by_me" if msg.is_sent else "to_me",
            "counterparty": (
                ", ".join(a.get("email", "") for a in (msg.to_addresses or [])[:3]) if msg.is_sent
                else msg.from_address
            ),
            "description": sentence[:300],
            "evidence": sentence[:500],
            "due_at": due[0].due_at if due else None,
            "date_type": due[0].date_type if due else "none",
            "confidence": 0.45,
        })
        if len(out) >= 5:
            break
    return out


def _rule_summary(msg: EmailMessage) -> str:
    body = re.sub(r"\s+", " ", msg.body_text or msg.snippet or "").strip()
    first = re.split(r"(?<=[.!?])\s", body, maxsplit=1)[0][:220]
    who = msg.from_name or msg.from_address or "Unknown sender"
    return f"{who}: {msg.subject or '(no subject)'}" + (f" — {first}" if first else "")


def _rule_explanation(components: dict[str, int], escalation: str | None, flags: list[dict[str, str]]) -> str:
    parts = [f"{k} {v}" for k, v in components.items()]
    text = "Rule-based assessment (scores 0-100): " + ", ".join(parts) + "."
    if escalation:
        text += f" Escalated to HIGH: {escalation.replace('_', ' ')}."
    if flags:
        text += " Risk indicators: " + "; ".join(f["detail"] for f in flags[:3]) + "."
    return text


async def analyze_message(message_id: UUID, llm: LLMService | None = None, use_llm: bool = True) -> AnalysisOutcome:
    llm = llm or get_llm_service()
    async with system_session() as session:
        msg = await session.get(EmailMessage, message_id)
        if msg is None or msg.is_deleted:
            raise LookupError("message not found")
        settings = await session.get(UserSettings, msg.user_id) or UserSettings(user_id=msg.user_id)
        contact = None
        prefs = None
        if msg.from_address:
            contact = (
                await session.execute(
                    select(Contact).where(Contact.user_id == msg.user_id, Contact.email == msg.from_address)
                )
            ).scalar_one_or_none()
            if contact:
                prefs = await session.get(ContactPreference, contact.id)
        thread_rows = (
            await session.execute(
                select(EmailMessage)
                .where(EmailMessage.thread_id == msg.thread_id, EmailMessage.id != msg.id,
                       EmailMessage.internal_date <= msg.internal_date)
                .order_by(EmailMessage.internal_date.desc())
                .limit(4)
            )
        ).scalars().all()
        participated = (
            await session.execute(
                select(EmailMessage.id).where(EmailMessage.thread_id == msg.thread_id,
                                              EmailMessage.is_sent.is_(True)).limit(1)
            )
        ).first() is not None
        attachment_names = list(
            (await session.execute(select(EmailAttachment.filename).where(EmailAttachment.message_id == msg.id)))
            .scalars().all()
        )
        duplicate_of = None
        if msg.content_hash:
            duplicate_of = (
                await session.execute(
                    select(EmailMessage.id)
                    .where(EmailMessage.user_id == msg.user_id, EmailMessage.content_hash == msg.content_hash,
                           EmailMessage.id != msg.id, EmailMessage.internal_date < msg.internal_date,
                           EmailMessage.internal_date > msg.internal_date - timedelta(days=14))
                    .order_by(EmailMessage.internal_date).limit(1)
                )
            ).scalar_one_or_none()

    tz_name = settings.timezone or "UTC"
    tz = ZoneInfo(tz_name)
    now = datetime.now(UTC)
    body = msg.body_text or msg.snippet or ""
    features = compute_rule_features(
        subject=msg.subject or "", body=body, from_address=msg.from_address, headers=msg.headers or {},
        label_ids=msg.label_ids or [], now=now, user_timezone=tz_name,
        contact_importance=contact.importance if contact else None, is_vip=bool(contact and contact.is_vip),
        has_outbound_history=bool(contact and contact.outbound_count > 0),
        user_participated_in_thread=participated, thread_message_count=len(thread_rows) + 1,
    )
    risk = assess_risk(
        from_address=msg.from_address, from_name=msg.from_name, reply_to=msg.reply_to, subject=msg.subject or "",
        body=body, links=msg.links or [], headers=msg.headers or {}, attachment_names=attachment_names,
        known_contact=bool(contact and (contact.outbound_count > 0 or contact.is_vip)),
    )
    meetings: list[DetectedMeeting] = parse_ics(msg.calendar_data) if msg.calendar_data else []

    # --- Remote LLM -------------------------------------------------------------
    out: EmailAnalysisOutput | None = None
    model: str | None = None
    llm_pending = False
    llm_error: str | None = None
    if use_llm and llm.available:
        context_text = "\n\n".join(
            f"[{m.internal_date.astimezone(tz).isoformat()}] {m.from_address}: {(m.body_text or m.snippet or '')[:1500]}"
            for m in reversed(thread_rows)
        )
        trusted = (
            f"Current date/time: {now.astimezone(tz).isoformat()} (user timezone {tz_name}).\n"
            f"Mailbox owner sent this message: {'yes' if msg.is_sent else 'no'}.\n"
            f"Sender is a VIP contact: {'yes' if contact and contact.is_vip else 'no'}. "
            f"Owner has written to this sender before: {'yes' if contact and contact.outbound_count else 'no'}."
        )
        untrusted = {"email": _format_email(msg, tz, attachment_names)}
        if context_text:
            untrusted["earlier_thread_messages"] = context_text
        try:
            out, meta = await llm.generate(
                task="email_analysis", system_prompt=ANALYSIS_SYSTEM, untrusted=untrusted, trusted_context=trusted,
                output_model=EmailAnalysisOutput, user_id=msg.user_id,
            )
            model = meta.model
        except (LLMUnavailableError, LLMTimeoutError) as exc:
            llm_pending, llm_error = True, exc.code
        except LLMNotConfiguredError:
            pass
        except LLMError as exc:
            llm_error = exc.code
            log.warning("llm_analysis_invalid", message_id=str(message_id), error=exc.code)

    # --- Merge --------------------------------------------------------------------
    source_text = f"{msg.subject or ''}\n{body}"
    deadline_at, deadline_text, deadline_type, deadline_tz = None, None, "none", None
    if out and out.deadline and out.deadline.date_type != "none" and out.deadline.iso_datetime:
        llm_dt = parse_iso_datetime(out.deadline.iso_datetime, out.deadline.timezone or tz_name)
        text_ok = bool(out.deadline.text and evidence_supported(out.deadline.text, source_text))
        near_rule = any(abs((c.due_at - llm_dt).total_seconds()) < 36 * 3600
                        for c in features.deadline_candidates) if llm_dt else False
        if llm_dt and (text_ok or near_rule):
            deadline_at, deadline_text = llm_dt, out.deadline.text
            deadline_type, deadline_tz = out.deadline.date_type, out.deadline.timezone or tz_name
    if deadline_at is None and features.deadline:
        d = features.deadline
        deadline_at, deadline_text, deadline_type, deadline_tz = d.due_at, d.text, d.date_type, d.timezone

    llm_components = out.components.model_dump() if out else None
    components = blend_components(features.components, llm_components)
    if deadline_at is not None:
        from app.analysis.rules import deadline_urgency

        components["deadline"] = max(components["deadline"], deadline_urgency(deadline_at, now))
    flags = merge_flags(risk.flags, [f.model_dump() for f in out.risk_flags] if out else [])
    if out and out.prompt_injection_detected and not any(f["code"] == "prompt_injection" for f in flags):
        flags.append({"code": "prompt_injection", "detail": "Message contains instructions aimed at AI assistants"})
    risk_level = risk.level
    if any(f["code"] == "prompt_injection" for f in flags) and risk_level in {"none", "low"}:
        risk_level = "medium"

    is_newsletter = features.is_newsletter or bool(out and out.is_newsletter)
    action_required = bool(out.action_required) if out else features.action_required
    reply_needed = bool(out.reply_needed) if out else features.reply_needed
    confidence = float(out.confidence) if out else (0.75 if is_newsletter or features.is_notification else 0.55)
    decision = decide_priority(
        components=components, weights=settings.scoring_weights, thresholds=settings.priority_thresholds, now=now,
        deadline_at=deadline_at, action_required=action_required,
        is_security_alert=features.is_security_alert and not msg.is_sent,
        is_incident=features.is_incident and not msg.is_sent, risk_level=risk_level, confidence=confidence,
        review_threshold=float(settings.review_confidence_threshold),
        llm_priority=out.priority if out else None,
        priority_floor=prefs.priority_floor if prefs else None,
        priority_ceiling=prefs.priority_ceiling if prefs else None,
        muted=bool(prefs and prefs.muted), is_newsletter=is_newsletter,
    )
    priority = "LOW" if msg.is_sent else decision.priority

    tasks: list[dict[str, Any]] = []
    if not msg.is_sent:
        if out:
            for llm_task in out.tasks:
                if not evidence_supported(llm_task.evidence, source_text):
                    continue
                due = parse_iso_datetime(llm_task.due_iso, tz_name) if llm_task.date_type != "none" else None
                tasks.append({"title": llm_task.title, "kind": llm_task.kind, "evidence": llm_task.evidence,
                              "due_at": due, "date_type": llm_task.date_type if due else "none",
                              "confidence": llm_task.confidence})
        else:
            for rule_task in features.tasks:
                rule_due: Any = rule_task["due"]
                tasks.append({"title": rule_task["title"], "kind": rule_task["kind"], "evidence": rule_task["evidence"],
                              "due_at": rule_due.due_at if rule_due else None,
                              "date_type": rule_due.date_type if rule_due else "none",
                              "confidence": rule_task["confidence"]})
    commitments: list[dict[str, Any]] = []
    if out:
        for llm_c in out.commitments:
            if llm_c.direction == "by_me" and not msg.is_sent:
                continue  # the owner can only promise things in messages they sent
            if not evidence_supported(llm_c.evidence, source_text):
                continue
            due = parse_iso_datetime(llm_c.due_iso, tz_name) if llm_c.date_type != "none" else None
            commitments.append({"direction": llm_c.direction, "counterparty": llm_c.counterparty,
                                "description": llm_c.description, "evidence": llm_c.evidence, "due_at": due,
                                "date_type": llm_c.date_type if due else "none", "confidence": llm_c.confidence})
    else:
        commitments = _rule_commitments(msg, now, tz_name)

    if out and out.meeting and not meetings and (out.meeting.start_iso or out.meeting.conference_url):
        mi = out.meeting
        meetings.append(DetectedMeeting(
            title=mi.title, start_at=parse_iso_datetime(mi.start_iso, mi.timezone or tz_name),
            end_at=parse_iso_datetime(mi.end_iso, mi.timezone or tz_name), timezone=mi.timezone, location=mi.location,
            conference_url=mi.conference_url, participants=mi.participants, agenda=mi.agenda,
            requested_response=mi.requested_response, source="llm",
        ))
    elif not meetings and not is_newsletter:
        if text_meeting := detect_text_meeting(msg.subject or "", body):
            meetings.append(text_meeting)

    source = "hybrid" if out else "rules"
    entities = out.entities.model_dump() if out else {}
    record = dict(
        user_id=msg.user_id, message_id=msg.id, source=source, model=model, prompt_version=PROMPT_VERSION,
        priority=priority, priority_score=decision.score, rule_score=None if out else decision.score,
        components=components | {"review_reasons": decision.review_reasons},
        summary=(out.summary if out else _rule_summary(msg))[:500],
        explanation=(out.explanation if out else _rule_explanation(components, decision.escalation_reason, flags))[:800],
        confidence=round(confidence, 2), needs_review=decision.needs_review and not msg.is_sent,
        reply_needed=reply_needed and not msg.is_sent, action_required=action_required and not msg.is_sent,
        suggested_action=(out.suggested_next_action if out else None),
        deadline_at=deadline_at, deadline_timezone=deadline_tz, deadline_text=deadline_text,
        deadline_type=deadline_type, entities=entities,
        category="sent" if msg.is_sent else (out.category if out else features.category),
        is_newsletter=is_newsletter, is_notification=features.is_notification or bool(out and out.is_notification),
        duplicate_of=duplicate_of, escalation_reason=None if msg.is_sent else decision.escalation_reason,
        risk_level=risk_level, risk_flags=flags, analyzed_at=now,
    )
    if record["rule_score"] is None:
        record["rule_score"] = decide_priority(
            components=features.components, weights=settings.scoring_weights,
            thresholds=settings.priority_thresholds, now=now, deadline_at=None, action_required=False,
            is_security_alert=False, is_incident=False, risk_level="none", confidence=1, review_threshold=0,
        ).score

    async with system_session() as session:
        stmt = pg_insert(EmailAnalysis).values(**record)
        await session.execute(
            stmt.on_conflict_do_update(
                index_elements=["message_id"],
                set_={k: stmt.excluded[k] for k in record if k not in {"user_id", "message_id"}},
            )
        )
        # Replace unconfirmed AI suggestions from earlier analyses of this message.
        await session.execute(delete(Task).where(and_(
            Task.source_message_id == msg.id, Task.status == "suggested", Task.created_by != "user")))
        await session.execute(delete(Commitment).where(and_(
            Commitment.source_message_id == msg.id, Commitment.status == "suggested", Commitment.created_by != "user")))
        for t in tasks:
            needs_conf = t["date_type"] == "inferred" or t["confidence"] < 0.7 or source == "rules"
            await session.execute(pg_insert(Task).values(
                user_id=msg.user_id, source_message_id=msg.id, source_thread_id=msg.thread_id,
                title=t["title"][:200], kind=t["kind"], due_at=t["due_at"], due_date_type=t["date_type"],
                due_timezone=tz_name if t["due_at"] else None, evidence=t["evidence"][:500],
                status="suggested" if needs_conf else "open", needs_confirmation=needs_conf,
                confidence=round(float(t["confidence"]), 2), created_by="ai" if out else "rules",
                reminder_at=(t["due_at"] - timedelta(hours=24)) if t["due_at"] else None,
            ).on_conflict_do_nothing())
        for c in commitments:
            needs_conf = c["date_type"] == "inferred" or c["confidence"] < 0.7 or source == "rules"
            await session.execute(pg_insert(Commitment).values(
                user_id=msg.user_id, source_message_id=msg.id, source_thread_id=msg.thread_id,
                direction=c["direction"], counterparty=(c["counterparty"] or None),
                description=c["description"][:1000], due_at=c["due_at"], due_date_type=c["date_type"],
                evidence=c["evidence"][:500], status="suggested" if needs_conf else "open",
                needs_confirmation=needs_conf, confidence=round(float(c["confidence"]), 2),
                created_by="ai" if out else "rules",
            ).on_conflict_do_nothing())
        for m in meetings[:3]:
            stmt_m = pg_insert(Meeting).values(
                user_id=msg.user_id, message_id=msg.id, title=m.title, start_at=m.start_at, end_at=m.end_at,
                timezone=m.timezone, location=m.location, conference_url=m.conference_url,
                participants=m.participants, agenda=m.agenda, requested_response=m.requested_response,
                source=m.source,
            )
            await session.execute(stmt_m.on_conflict_do_update(
                index_elements=["message_id", "source"],
                set_={k: stmt_m.excluded[k] for k in ("title", "start_at", "end_at", "timezone", "location",
                                                     "conference_url", "participants", "agenda",
                                                     "requested_response")},
            ))
        await session.execute(
            update(EmailMessage).where(EmailMessage.id == msg.id).values(
                analysis_status=AnalysisStatus.queued if llm_pending else AnalysisStatus.done
            )
        )
    return AnalysisOutcome(message_id=msg.id, source=source, priority=priority, llm_pending=llm_pending,
                           llm_error=llm_error)
