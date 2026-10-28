"""Deterministic email features and rule-based classification."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime, timedelta

from app.analysis.deadlines import (
    DeadlineCandidate,
    extract_deadlines,
    primary_deadline,
)

_REQUEST = re.compile(
    r"\b(please|kindly|could you|can you|would you|i need you to|we need you to|action required|"
    r"required to|make sure to|remember to|don't forget to|need your)\b",
    re.I,
)
_REPLY_CUE = re.compile(
    r"(\?\s*$|\blet me know\b|\bplease (?:confirm|reply|respond|advise)\b|\brsvp\b|\byour thoughts\b|"
    r"\bget back to me\b|\bawaiting your (?:reply|response)\b|\bcan you confirm\b)",
    re.I | re.M,
)
_ACTION_VERBS = re.compile(
    r"\b(sign|review|approve|submit|pay|send|confirm|complete|update|share|upload|fill|register|respond|"
    r"schedule|prepare|provide|renew|book)\b",
    re.I,
)
_IMPACT = re.compile(
    r"\b(contract|invoice|payment|overdue|legal|compliance|audit|outage|incident|breach|production|"
    r"interview|offer letter|deadline|penalty|termination|escalat\w+|customer|renewal|salary|tax)\b",
    re.I,
)
_SECURITY_ALERT = re.compile(
    r"\b(security alert|new sign-?in|unusual (?:sign-?in|activity)|suspicious (?:sign-?in|activity)|"
    r"password (?:was )?(?:changed|reset)|2-step verification|two-factor|verification code|account (?:locked|compromised))\b",
    re.I,
)
_INCIDENT = re.compile(
    r"\b(sev ?[01]|p[01]\b|outage|production (?:is )?down|critical incident|service disruption|data breach|"
    r"system down|major incident)\b",
    re.I,
)
_NOREPLY = re.compile(r"^(no-?reply|do-?not-?reply|notifications?|alerts?|mailer-daemon|bounce)", re.I)
_SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+|\n+")


@dataclass(slots=True)
class RuleFeatures:
    components: dict[str, int]
    category: str
    is_newsletter: bool
    is_notification: bool
    is_security_alert: bool
    is_incident: bool
    reply_needed: bool
    action_required: bool
    deadline: DeadlineCandidate | None
    deadline_candidates: list[DeadlineCandidate] = field(default_factory=list)
    tasks: list[dict[str, object]] = field(default_factory=list)


def _sender_importance(from_address: str | None, contact_importance: int | None, is_vip: bool,
                       has_outbound_history: bool) -> int:
    if is_vip:
        return 95
    if contact_importance is not None and contact_importance != 50:
        return contact_importance
    local = (from_address or "").split("@")[0]
    if _NOREPLY.match(local):
        return 15
    if has_outbound_history:
        return 65
    return contact_importance if contact_importance is not None else 35


def deadline_urgency(due: datetime | None, now: datetime) -> int:
    if due is None:
        return 0
    remaining = due - now
    if remaining < timedelta(0):
        return 70  # overdue but recent: still pressing
    if remaining <= timedelta(hours=24):
        return 95
    if remaining <= timedelta(days=3):
        return 75
    if remaining <= timedelta(days=7):
        return 55
    if remaining <= timedelta(days=30):
        return 30
    return 15


def extract_rule_tasks(body: str, candidates: list[DeadlineCandidate]) -> list[dict[str, object]]:
    tasks: list[dict[str, object]] = []
    quoted = re.split(r"\n(?:On .{5,120}wrote:|-----Original Message-----|From: .+\nSent: )", body, maxsplit=1)[0]
    offset = 0
    for sentence in _SENTENCE_SPLIT.split(quoted[:8000]):
        sentence_stripped = sentence.strip()
        start = quoted.find(sentence_stripped, offset)
        offset = max(offset, start)
        if not (15 <= len(sentence_stripped) <= 300):
            continue
        if sentence_stripped.startswith(">"):
            continue
        if _REQUEST.search(sentence_stripped) and _ACTION_VERBS.search(sentence_stripped):
            due = next((c for c in candidates if start <= c.start <= start + len(sentence_stripped)), None)
            title = re.sub(r"^(hi|hello|dear)\b[^,]*,\s*", "", sentence_stripped, flags=re.I)
            title = re.sub(r"\b(please|kindly|could you|can you|would you)\b\s*(also\s*)?", "", title, flags=re.I)
            title = title.strip(" ?.!").capitalize()[:200]
            tasks.append({
                "title": title or sentence_stripped[:200],
                "kind": "reply_requested" if sentence_stripped.endswith("?") else "task",
                "evidence": sentence_stripped,
                "due": due,
                "confidence": 0.5,
            })
        if len(tasks) >= 5:
            break
    return tasks


def compute_rule_features(
    *,
    subject: str,
    body: str,
    from_address: str | None,
    headers: dict[str, str],
    label_ids: list[str],
    now: datetime,
    user_timezone: str,
    contact_importance: int | None,
    is_vip: bool,
    has_outbound_history: bool,
    user_participated_in_thread: bool,
    thread_message_count: int,
) -> RuleFeatures:
    text = f"{subject}\n{body[:20000]}"
    is_newsletter = bool(
        headers.get("list-unsubscribe") or headers.get("list-id")
        or headers.get("precedence", "").lower() in {"bulk", "list"}
        or "CATEGORY_PROMOTIONS" in label_ids
    )
    local = (from_address or "").split("@")[0]
    is_notification = not is_newsletter and bool(
        _NOREPLY.match(local) or headers.get("auto-submitted", "no").lower() != "no"
        or "CATEGORY_UPDATES" in label_ids
    )
    is_security_alert = bool(_SECURITY_ALERT.search(text))
    is_incident = bool(_INCIDENT.search(text))

    candidates = extract_deadlines(body, now, user_timezone) + extract_deadlines(subject, now, user_timezone)
    deadline = primary_deadline(candidates, now)
    request = bool(_REQUEST.search(body)) and bool(_ACTION_VERBS.search(body))
    reply_needed = not (is_newsletter or is_notification) and bool(_REPLY_CUE.search(body[:6000]))
    action_required = request or reply_needed or is_security_alert or is_incident

    components = {
        "deadline": deadline_urgency(deadline.due_at if deadline else None, now),
        "action": 0 if is_newsletter else (80 if request else 60 if reply_needed else 40 if action_required else 10),
        "impact": 85 if (is_incident or is_security_alert) else 65 if _IMPACT.search(text) else 25,
        "sender": _sender_importance(from_address, contact_importance, is_vip, has_outbound_history),
        "context": 70 if user_participated_in_thread else 45 if thread_message_count > 1 else 25,
    }
    if is_newsletter:
        components = {k: min(v, 20) for k, v in components.items()}

    category = (
        "security" if is_security_alert
        else "newsletter" if is_newsletter
        else "notification" if is_notification
        else "work" if _IMPACT.search(text) or request
        else "other"
    )
    tasks = [] if (is_newsletter or is_notification) else extract_rule_tasks(body, candidates)
    return RuleFeatures(
        components=components, category=category, is_newsletter=is_newsletter, is_notification=is_notification,
        is_security_alert=is_security_alert, is_incident=is_incident, reply_needed=reply_needed,
        action_required=action_required, deadline=deadline, deadline_candidates=candidates, tasks=tasks,
    )
