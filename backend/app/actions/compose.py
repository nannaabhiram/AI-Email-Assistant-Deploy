"""Gmail-style compose: send-now with an undo window, and recipient autocomplete.

A message the user writes and presses Send on is their explicit decision, so it skips the
review queue: it is recorded as an approval the user granted, and the send job is scheduled
``undo_seconds`` in the future. Undo cancels the approval before the worker claims it; the
execution path (row locks, deterministic Message-ID, duplicate-send checks) is the same one
used for approved replies.
"""

from __future__ import annotations

import math
import re
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

from sqlalchemy import and_, func, or_, select, update

from app.actions.drafts import validate_addresses
from app.actions.engine import PermissionUpgradeRequired, _send_params, params_hash, required_scope_ok
from app.config import get_settings
from app.db.models import (
    AccountStatus,
    ActionApproval,
    ActionType,
    ApprovalState,
    ConnectedAccount,
    Contact,
    Draft,
    DraftStatus,
)
from app.db.session import system_session, user_session
from app.errors import AppError, ConflictError, NotFoundError
from app.jobs.queue import enqueue
from app.services.audit import record_audit

UNDO_MIN, UNDO_MAX, UNDO_DEFAULT = 5, 30, 10
MAX_RECIPIENTS = 100
_TOKEN_RE = re.compile(r"[a-z0-9+']+")
_SPLIT_RE = re.compile(r"[^a-z0-9+']+")
RECENCY_HALF_LIFE_DAYS = 30.0
FUZZY_THRESHOLD = 0.45


@dataclass
class ComposeResult:
    approval: ActionApproval
    draft_id: UUID
    send_at: datetime


async def _pick_account(s: Any, user_id: UUID, account_id: UUID | None) -> ConnectedAccount:
    q = select(ConnectedAccount).where(ConnectedAccount.user_id == user_id)
    if account_id:
        q = q.where(ConnectedAccount.id == account_id)
    else:
        q = q.where(ConnectedAccount.status == AccountStatus.active).order_by(ConnectedAccount.created_at)
    account = (await s.execute(q.limit(1))).scalar_one_or_none()
    if account is None:
        raise NotFoundError("Connect a Gmail account before sending", code="no_account")
    if account.status != AccountStatus.active:
        raise ConflictError(f"{account.email_address} needs to be reconnected", code="account_inactive")
    return account


async def send_composed(
    user_id: UUID, *, to: list[str], cc: list[str], bcc: list[str], subject: str, body: str,
    undo_seconds: int = UNDO_DEFAULT, account_id: UUID | None = None,
) -> ComposeResult:
    to, cc, bcc = validate_addresses(to, "To"), validate_addresses(cc, "Cc"), validate_addresses(bcc, "Bcc")
    if not (to or cc or bcc):
        raise AppError("Add at least one recipient", code="invalid_recipient")
    if len(set(to) | set(cc) | set(bcc)) > MAX_RECIPIENTS:
        raise AppError(f"A message can have at most {MAX_RECIPIENTS} recipients", code="invalid_recipient")
    subject = subject.strip()
    if not subject and not body.strip():
        raise AppError("The message is empty", code="empty_draft")
    undo = max(UNDO_MIN, min(UNDO_MAX, undo_seconds))

    async with system_session() as s:
        account = await _pick_account(s, user_id, account_id)
        if not required_scope_ok(ActionType.send_reply, account.granted_scopes):
            raise PermissionUpgradeRequired("Sending requires granting Gmail send permission",
                                            details={"scope_set": "send", "account_id": str(account.id)})
        draft = Draft(user_id=user_id, account_id=account.id, to_addresses=to, cc_addresses=cc, bcc_addresses=bcc,
                      subject=subject, body=body, source="user", status=DraftStatus.approved)
        s.add(draft)
        await s.flush()
        params = await _send_params(s, draft, account)
        now = datetime.now(UTC)
        everyone = [*to, *cc, *bcc]
        approval = ActionApproval(
            user_id=user_id, account_id=account.id, action_type=ActionType.send_reply, draft_id=draft.id,
            params=params, params_hash=params_hash(params), proposed_by="user",
            explanation=f"Send “{subject or '(no subject)'}” to {', '.join(everyone[:5])}"
                        + (f" and {len(everyone) - 5} more" if len(everyone) > 5 else ""),
            state=ApprovalState.PENDING_APPROVAL,
            expires_at=now + timedelta(hours=get_settings().approval_ttl_hours),
            idempotency_key=f"compose:{uuid.uuid4()}",
        )
        s.add(approval)
        await s.flush()
        # Pressing Send is the owner's approval of this exact content.
        approval.state = ApprovalState.APPROVED
        approval.approved_by, approval.approved_at, approval.decided_at = user_id, now, now
        send_at = now + timedelta(seconds=undo)
        await enqueue(s, "execute_action", {"approval_id": str(approval.id)}, user_id=user_id,
                      dedupe_key=f"execute:{approval.id}", priority=1, max_attempts=3, run_at=send_at)
        record_audit(s, user_id=user_id, event="compose.send_scheduled", entity_type="action_approval",
                     entity_id=approval.id, details={"draft_id": str(draft.id), "recipients": len(everyone),
                                                     "undo_seconds": undo})
        await s.flush()
        await s.refresh(approval)
        return ComposeResult(approval=approval, draft_id=draft.id, send_at=send_at)


async def undo_send(user_id: UUID, approval_id: UUID) -> Draft:
    async with system_session() as s:
        approval = (await s.execute(
            select(ActionApproval).where(ActionApproval.id == approval_id).with_for_update()
        )).scalar_one_or_none()
        if approval is None or approval.user_id != user_id or approval.action_type != ActionType.send_reply:
            raise NotFoundError("Message not found")
        if approval.state != ApprovalState.APPROVED:
            raise ConflictError("Too late to undo: the message is already sending or sent", code="already_sent")
        approval.state = ApprovalState.CANCELLED
        approval.decided_at, approval.decision_reason = datetime.now(UTC), "undo_send"
        # The client reopens the message from its own copy, so this server draft is retired.
        await s.execute(update(Draft).where(Draft.id == approval.draft_id).values(status=DraftStatus.discarded))
        record_audit(s, user_id=user_id, event="compose.send_undone", entity_type="action_approval",
                     entity_id=approval.id)
        await s.flush()
        draft = await s.get(Draft, approval.draft_id)
        assert draft is not None
        await s.refresh(draft)
        return draft


# --- Recipient autocomplete -----------------------------------------------------------
def tokens(q: str) -> list[str]:
    return list(dict.fromkeys(_TOKEN_RE.findall(q.lower())))[:6]


def _words(contact_email: str, name: str | None) -> list[str]:
    local = contact_email.split("@")[0]
    return [w for w in (_SPLIT_RE.split(local) + _SPLIT_RE.split((name or "").lower()) + [contact_email.split("@")[-1]]) if w]


def match_score(q: str, toks: list[str], email: str, name: str | None) -> float:
    """How well the typed text matches, independent of how often the contact is used."""
    raw = q.strip().lower()
    email_l, name_l = email.lower(), (name or "").lower()
    if raw and email_l.startswith(raw):
        return 100.0
    if raw and name_l.startswith(raw):
        return 95.0
    words = _words(email_l, name_l)
    if toks and all(any(w.startswith(t) for w in words) for t in toks):
        return 80.0
    return 50.0


def usage_score(c: Contact, now: datetime) -> float:
    """Frecency: people you write to outrank people who write to you; recent beats old."""
    freq = math.log1p(2 * c.outbound_count + c.inbound_count) * 8

    def decay(ts: datetime | None) -> float:
        if ts is None:
            return 0.0
        days = max(0.0, (now - ts).total_seconds() / 86400)
        return 0.5 ** (days / RECENCY_HALF_LIFE_DAYS)

    return freq + 35 * decay(c.last_outbound_at) + 12 * decay(c.last_inbound_at) + (6 if c.is_vip else 0)


async def suggest_recipients(user_id: UUID, q: str, limit: int = 8) -> tuple[list[dict[str, Any]], int]:
    toks = tokens(q)
    if not toks:
        return [], 0
    raw = q.strip().lower()
    email_l, name_l = func.lower(Contact.email), func.lower(func.coalesce(Contact.display_name, ""))
    cond = and_(Contact.user_id == user_id,
                *[or_(email_l.contains(t, autoescape=True), name_l.contains(t, autoescape=True)) for t in toks])
    recency = func.greatest(Contact.last_outbound_at, Contact.last_inbound_at)
    now = datetime.now(UTC)
    async with user_session(user_id) as s:
        total = (await s.execute(select(func.count()).select_from(Contact).where(cond))).scalar_one()
        rows = (await s.execute(select(Contact).where(cond).order_by(recency.desc().nulls_last()).limit(300))).scalars().all()
        scored = [(match_score(q, toks, c.email, c.display_name) + usage_score(c, now), c) for c in rows]
        if len(rows) < limit and len(raw) >= 3:
            # Typo tolerance ("nanna.abiram" -> nanna.abhiram@...), via pg_trgm word similarity.
            sim = func.greatest(func.extensions.word_similarity(raw, email_l),
                                func.extensions.word_similarity(raw, name_l))
            fuzzy = (await s.execute(
                select(Contact, sim.label("sim"))
                .where(Contact.user_id == user_id, sim >= FUZZY_THRESHOLD, Contact.id.notin_([c.id for c in rows]))
                .order_by(sim.desc()).limit(limit)
            )).all()
            scored += [(150 * float(score) + 0.25 * usage_score(c, now), c) for c, score in fuzzy]
            total += len(fuzzy)
    scored.sort(key=lambda x: x[0], reverse=True)
    items = [{
        "email": c.email,
        "name": c.display_name,
        "is_vip": c.is_vip,
        "sent_count": c.outbound_count,
        "received_count": c.inbound_count,
        "last_contacted_at": max(filter(None, [c.last_outbound_at, c.last_inbound_at]), default=None),
    } for _, c in scored[:limit]]
    return items, total
