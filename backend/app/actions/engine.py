"""Approval state machine and guarded execution of mailbox actions.

PROPOSED -> PENDING_APPROVAL -> APPROVED -> EXECUTING -> SUCCEEDED
plus REJECTED, EXPIRED, FAILED, CANCELLED. Legal transitions are also enforced by a
database trigger, so no code path can skip a state.

Guarantees:
* Only the owning, authenticated user can approve; identity comes from the verified JWT.
* An approval binds to a SHA-256 hash of the exact parameters (recipients, subject,
  body, thread). The client must echo the hash it reviewed; any later change to the
  draft cancels the approval (DB trigger) and execution re-verifies the hash.
* Execution claims the approval with a row lock and a state transition, so concurrent
  workers cannot double-execute. Sent messages carry a deterministic Message-ID and
  retries first check Gmail for it, preventing duplicate sends after crashes.
* LLM output is never used as authorization.
"""

from __future__ import annotations

import base64
import uuid
from datetime import UTC, datetime, timedelta
from email.message import EmailMessage as MimeMessage
from email.utils import formatdate
from typing import Any
from uuid import UUID

from sqlalchemy import select, update

from app.config import get_settings
from app.db.models import (
    AccountStatus,
    ActionApproval,
    ActionExecution,
    ActionType,
    ApprovalState,
    ConnectedAccount,
    Draft,
    DraftStatus,
    EmailMessage,
    EmailThread,
    GmailLabel,
)
from app.db.session import system_session
from app.errors import AppError, ConflictError, ForbiddenError, NotFoundError
from app.gmail.client import (
    SCOPE_MODIFY,
    SCOPE_SEND,
    GmailAuthError,
    GmailClient,
    GmailError,
    GmailNotFoundError,
    GmailRateLimitError,
)
from app.jobs.queue import enqueue
from app.logging import get_logger
from app.security.crypto import canonical_hash, constant_time_equals
from app.services.audit import record_audit

log = get_logger(__name__)

OPEN_STATES = (ApprovalState.PROPOSED, ApprovalState.PENDING_APPROVAL, ApprovalState.APPROVED)
STALE_EXECUTION = timedelta(minutes=3)
MAILBOX_ACTIONS = {ActionType.archive, ActionType.apply_label, ActionType.remove_label, ActionType.mark_read,
                   ActionType.mark_unread}


class PermissionUpgradeRequired(AppError):
    status_code = 403
    code = "permission_upgrade_required"


def required_scope_ok(action: ActionType, granted: list[str]) -> bool:
    if action == ActionType.send_reply:
        return SCOPE_SEND in granted or SCOPE_MODIFY in granted
    return SCOPE_MODIFY in granted


def _scope_set_for(action: ActionType) -> str:
    return "send" if action == ActionType.send_reply else "modify"


async def _send_params(s: Any, draft: Draft, account: ConnectedAccount) -> dict[str, Any]:
    thread = await s.get(EmailThread, draft.thread_id) if draft.thread_id else None
    reply_to = await s.get(EmailMessage, draft.reply_to_message_id) if draft.reply_to_message_id else None
    if thread is not None and (thread.user_id != draft.user_id or thread.account_id != draft.account_id):
        raise ForbiddenError("Draft thread does not belong to this account")
    if reply_to is not None and reply_to.thread_id != draft.thread_id:
        raise AppError("Draft reply target is not in the draft's thread", code="thread_mismatch")
    references = None
    if reply_to is not None and reply_to.rfc822_message_id:
        references = " ".join(filter(None, [reply_to.references_header, reply_to.rfc822_message_id]))[-2000:]
    return {
        "account_email": account.email_address,
        "to": list(draft.to_addresses),
        "cc": list(draft.cc_addresses),
        "subject": draft.subject,
        "body": draft.body,
        "gmail_thread_id": thread.gmail_thread_id if thread else None,
        "in_reply_to": reply_to.rfc822_message_id if reply_to else None,
        "references": references,
        "draft_id": str(draft.id),
    }


def params_hash(params: dict[str, Any]) -> str:
    return canonical_hash(params)


async def request_send_approval(user_id: UUID, draft_id: UUID, acknowledge_external_recipients: bool = False) -> ActionApproval:
    from app.actions.drafts import thread_participants

    async with system_session() as s:
        draft = (await s.execute(select(Draft).where(Draft.id == draft_id).with_for_update())).scalar_one_or_none()
        if draft is None or draft.user_id != user_id:
            raise NotFoundError("Draft not found")
        if draft.status in (DraftStatus.sent, DraftStatus.discarded):
            raise ConflictError(f"Draft is {draft.status}")
        if not draft.body.strip():
            raise AppError("Draft body is empty", code="empty_draft")
        if not draft.to_addresses:
            raise AppError("Draft has no recipients", code="invalid_recipient")
        account = await s.get(ConnectedAccount, draft.account_id)
        if account is None or account.user_id != user_id:
            raise ForbiddenError("Account does not belong to you")
        if not required_scope_ok(ActionType.send_reply, account.granted_scopes):
            raise PermissionUpgradeRequired("Sending requires granting Gmail send permission",
                                            details={"scope_set": "send", "account_id": str(account.id)})
        params = await _send_params(s, draft, account)
        thread_id = draft.thread_id

    participants = await thread_participants(thread_id)
    external = sorted(set(params["to"] + params["cc"]) - participants - {params["account_email"]})
    if external and not acknowledge_external_recipients:
        raise AppError("Some recipients are not part of this conversation. Confirm them explicitly.",
                       code="external_recipients_unconfirmed", details={"external_recipients": external})

    async with system_session() as s:
        await s.execute(
            update(ActionApproval)
            .where(ActionApproval.draft_id == draft_id, ActionApproval.state.in_(OPEN_STATES))
            .values(state=ApprovalState.CANCELLED, decided_at=datetime.now(UTC), decision_reason="superseded")
        )
        explanation = (f"Send reply “{params['subject']}” to {', '.join(params['to'])}"
                       + (f" (cc {', '.join(params['cc'])})" if params["cc"] else "")
                       + (f". Recipients outside the thread: {', '.join(external)}" if external else ""))
        approval = ActionApproval(
            user_id=user_id, account_id=account.id, action_type=ActionType.send_reply,
            source_message_id=draft.reply_to_message_id, source_thread_id=thread_id, draft_id=draft_id,
            params=params, params_hash=params_hash(params), explanation=explanation, proposed_by="user",
            state=ApprovalState.PENDING_APPROVAL,
            expires_at=datetime.now(UTC) + timedelta(hours=get_settings().approval_ttl_hours),
            idempotency_key=f"send:{uuid.uuid4()}",
        )
        s.add(approval)
        await s.execute(update(Draft).where(Draft.id == draft_id).values(status=DraftStatus.pending_approval))
        await s.flush()
        record_audit(s, user_id=user_id, event="approval.requested", entity_type="action_approval",
                     entity_id=approval.id, details={"action": "send_reply", "draft_id": str(draft_id)})
        await s.refresh(approval)
        return approval


async def propose_mailbox_action(
    user_id: UUID, action_type: ActionType, message_ids: list[UUID], label_name: str | None = None,
    proposed_by: str = "user", explanation: str | None = None,
) -> ActionApproval:
    if action_type not in MAILBOX_ACTIONS:
        raise AppError("Unsupported mailbox action", code="invalid_action")
    if not message_ids or len(message_ids) > 200:
        raise AppError("Select between 1 and 200 messages", code="invalid_selection")
    if action_type in (ActionType.apply_label, ActionType.remove_label):
        label_name = (label_name or "").strip()
        if not label_name or len(label_name) > 100 or label_name.upper() in {"INBOX", "SPAM", "TRASH", "SENT", "DRAFT"}:
            raise AppError("A valid user label name is required", code="invalid_label")
    async with system_session() as s:
        rows = (await s.execute(
            select(EmailMessage.id, EmailMessage.gmail_message_id, EmailMessage.account_id, EmailMessage.subject,
                   EmailMessage.thread_id)
            .where(EmailMessage.id.in_(message_ids), EmailMessage.user_id == user_id)
        )).all()
        if len(rows) != len(set(message_ids)):
            raise NotFoundError("One or more messages were not found")
        accounts = {r.account_id for r in rows}
        if len(accounts) != 1:
            raise AppError("Messages must belong to a single connected account", code="invalid_selection")
        account = await s.get(ConnectedAccount, next(iter(accounts)))
        assert account is not None
        if not required_scope_ok(action_type, account.granted_scopes):
            raise PermissionUpgradeRequired("This action requires Gmail modify permission",
                                            details={"scope_set": "modify", "account_id": str(account.id)})
        params = {
            "account_email": account.email_address,
            "gmail_message_ids": sorted(r.gmail_message_id for r in rows),
            "label_name": label_name,
        }
        verb = {ActionType.archive: "Archive", ActionType.apply_label: f"Apply label “{label_name}” to",
                ActionType.remove_label: f"Remove label “{label_name}” from", ActionType.mark_read: "Mark as read",
                ActionType.mark_unread: "Mark as unread"}[action_type]
        subjects = ", ".join(f"“{(r.subject or '(no subject)')[:60]}”" for r in rows[:3])
        approval = ActionApproval(
            user_id=user_id, account_id=account.id, action_type=action_type,
            source_message_id=rows[0].id if len(rows) == 1 else None,
            source_thread_id=rows[0].thread_id if len(rows) == 1 else None,
            params=params, params_hash=params_hash(params),
            explanation=explanation or f"{verb} {len(rows)} message(s): {subjects}{'…' if len(rows) > 3 else ''}",
            proposed_by=proposed_by,
            state=ApprovalState.PROPOSED if proposed_by != "user" else ApprovalState.PENDING_APPROVAL,
            expires_at=datetime.now(UTC) + timedelta(hours=get_settings().approval_ttl_hours * 7),
            idempotency_key=f"{action_type.value}:{uuid.uuid4()}",
        )
        s.add(approval)
        await s.flush()
        record_audit(s, user_id=user_id, event="approval.requested", entity_type="action_approval",
                     entity_id=approval.id, details={"action": action_type.value, "count": len(rows),
                                                     "proposed_by": proposed_by})
        await s.refresh(approval)
        return approval


async def _locked_approval(s: Any, user_id: UUID, approval_id: UUID) -> ActionApproval:
    approval = (await s.execute(
        select(ActionApproval).where(ActionApproval.id == approval_id).with_for_update()
    )).scalar_one_or_none()
    # Same error for "missing" and "someone else's" so IDs cannot be probed.
    if approval is None or approval.user_id != user_id:
        raise NotFoundError("Approval not found")
    return approval


async def approve(user_id: UUID, approval_id: UUID, reviewed_params_hash: str) -> ActionApproval:
    async with system_session() as s:
        approval = await _locked_approval(s, user_id, approval_id)
        now = datetime.now(UTC)
        if approval.state not in (ApprovalState.PROPOSED, ApprovalState.PENDING_APPROVAL):
            raise ConflictError(f"Approval is {approval.state} and cannot be approved", code="invalid_state")
        if approval.expires_at <= now:
            approval.state = ApprovalState.EXPIRED
            approval.decided_at, approval.decision_reason = now, "expired"
            await s.commit()
            raise ConflictError("Approval request has expired", code="approval_expired")
        if not constant_time_equals(reviewed_params_hash, approval.params_hash):
            raise ConflictError("The reviewed content differs from the pending action; reload and review again",
                                code="params_mismatch")
        if approval.action_type == ActionType.send_reply:
            draft = await s.get(Draft, approval.draft_id) if approval.draft_id else None
            account = await s.get(ConnectedAccount, approval.account_id)
            if draft is None or account is None:
                raise ConflictError("Draft no longer exists", code="draft_missing")
            if params_hash(await _send_params(s, draft, account)) != approval.params_hash:
                approval.state = ApprovalState.CANCELLED
                approval.decided_at, approval.decision_reason = now, "draft_modified"
                await s.commit()
                raise ConflictError("Draft changed after approval was requested", code="draft_modified")
            draft.status = DraftStatus.approved
        if approval.state == ApprovalState.PROPOSED:
            approval.state = ApprovalState.PENDING_APPROVAL
            await s.flush()
        approval.state = ApprovalState.APPROVED
        approval.approved_by = user_id
        approval.approved_at = now
        approval.decided_at = now
        record_audit(s, user_id=user_id, event="approval.approved", entity_type="action_approval",
                     entity_id=approval.id, details={"action": approval.action_type.value})
        await enqueue(s, "execute_action", {"approval_id": str(approval.id)}, user_id=user_id,
                      dedupe_key=f"execute:{approval.id}", priority=1, max_attempts=3)
        await s.flush()
        await s.refresh(approval)
        return approval


async def decide(user_id: UUID, approval_id: UUID, new_state: ApprovalState, reason: str | None) -> ActionApproval:
    if new_state not in (ApprovalState.REJECTED, ApprovalState.CANCELLED):
        raise AppError("Unsupported decision", code="invalid_state")
    async with system_session() as s:
        approval = await _locked_approval(s, user_id, approval_id)
        if approval.state not in OPEN_STATES and not (
            new_state == ApprovalState.CANCELLED and approval.state == ApprovalState.FAILED
        ):
            raise ConflictError(f"Approval is {approval.state}", code="invalid_state")
        if new_state == ApprovalState.REJECTED and approval.state == ApprovalState.APPROVED:
            new_state = ApprovalState.CANCELLED
        approval.state = new_state
        approval.decided_at = datetime.now(UTC)
        approval.decision_reason = (reason or new_state.value.lower())[:500]
        if approval.draft_id:
            await s.execute(update(Draft).where(Draft.id == approval.draft_id,
                                                Draft.status.in_([DraftStatus.pending_approval, DraftStatus.approved]))
                            .values(status=DraftStatus.draft))
        record_audit(s, user_id=user_id, event=f"approval.{new_state.value.lower()}", entity_type="action_approval",
                     entity_id=approval.id)
        await s.flush()
        await s.refresh(approval)
        return approval


async def retry_failed(user_id: UUID, approval_id: UUID) -> ActionApproval:
    async with system_session() as s:
        approval = await _locked_approval(s, user_id, approval_id)
        if approval.state != ApprovalState.FAILED:
            raise ConflictError("Only failed actions can be retried", code="invalid_state")
        if approval.expires_at <= datetime.now(UTC):
            raise ConflictError("Approval has expired; request a new one", code="approval_expired")
        await enqueue(s, "execute_action", {"approval_id": str(approval.id)}, user_id=user_id,
                      dedupe_key=f"execute:{approval.id}", priority=1, max_attempts=3)
        record_audit(s, user_id=user_id, event="approval.retry_requested", entity_type="action_approval",
                     entity_id=approval.id)
        return approval


# ---------------------------------------------------------------------------------
# Execution
# ---------------------------------------------------------------------------------
def is_transient(exc: Exception) -> bool:
    """Failures worth an automatic retry: quota, Gmail 5xx and network errors (not auth or bad requests)."""
    if isinstance(exc, GmailRateLimitError):
        return True
    if isinstance(exc, (GmailAuthError, GmailNotFoundError)) or not isinstance(exc, GmailError):
        return False
    return exc.status is None or exc.status >= 500


def build_mime(params: dict[str, Any], message_id_header: str) -> str:
    mime = MimeMessage()
    mime["From"] = params["account_email"]
    mime["To"] = ", ".join(params["to"])
    if params.get("cc"):
        mime["Cc"] = ", ".join(params["cc"])
    mime["Subject"] = params["subject"]
    mime["Date"] = formatdate(localtime=False, usegmt=True)
    mime["Message-ID"] = message_id_header
    if params.get("in_reply_to"):
        mime["In-Reply-To"] = params["in_reply_to"]
        mime["References"] = params.get("references") or params["in_reply_to"]
    mime["X-MailPilot-Approval"] = "human-approved"
    mime.set_content(params["body"], charset="utf-8")
    return base64.urlsafe_b64encode(mime.as_bytes()).decode().rstrip("=")


async def _claim_for_execution(approval_id: UUID) -> tuple[ActionApproval, ActionExecution, bool] | None:
    """Lock, validate and move the approval to EXECUTING. Returns None if nothing to do."""
    async with system_session() as s:
        approval = (await s.execute(
            select(ActionApproval).where(ActionApproval.id == approval_id).with_for_update()
        )).scalar_one_or_none()
        if approval is None:
            return None
        execution = (await s.execute(
            select(ActionExecution).where(ActionExecution.approval_id == approval_id).with_for_update()
        )).scalar_one_or_none()
        now = datetime.now(UTC)
        recovering = False
        if approval.state == ApprovalState.SUCCEEDED:
            return None
        if approval.state == ApprovalState.EXECUTING:
            if execution and execution.started_at > now - STALE_EXECUTION:
                return None  # another worker is executing it right now
            recovering = True  # previous worker crashed mid-execution
        elif approval.state not in (ApprovalState.APPROVED, ApprovalState.FAILED):
            log.info("execution_skipped", approval_id=str(approval_id), state=approval.state.value)
            return None

        # Independent re-validation (do not trust the caller or the queue).
        if approval.approved_by != approval.user_id or approval.approved_at is None:
            raise ForbiddenError("Approval was not granted by its owner")
        if approval.expires_at <= now and not recovering:
            approval.state = ApprovalState.EXPIRED if approval.state == ApprovalState.APPROVED else ApprovalState.CANCELLED
            approval.decided_at, approval.decision_reason = now, "expired_before_execution"
            return None
        if params_hash(approval.params) != approval.params_hash:
            raise ForbiddenError("Approved parameters were tampered with")
        account = await s.get(ConnectedAccount, approval.account_id)
        if account is None or account.user_id != approval.user_id or account.status != AccountStatus.active:
            approval.state = ApprovalState.EXECUTING
            await s.flush()
            approval.state = ApprovalState.FAILED
            _set_exec(s, execution, approval, "failed", error="Connected account is not active")
            return None
        if approval.action_type == ActionType.send_reply:
            draft = await s.get(Draft, approval.draft_id) if approval.draft_id else None
            if draft is None or params_hash(await _send_params(s, draft, account)) != approval.params_hash:
                if approval.state in (ApprovalState.APPROVED, ApprovalState.FAILED):
                    approval.state = ApprovalState.CANCELLED
                    approval.decided_at, approval.decision_reason = now, "draft_modified"
                else:  # EXECUTING (recovery): never send content that differs from what was approved
                    approval.state = ApprovalState.FAILED
                    _set_exec(s, execution, approval, "failed", error="Draft changed during execution")
                return None

        if not recovering:
            approval.state = ApprovalState.EXECUTING
        if execution is None:
            domain = approval.params.get("account_email", "mailpilot.local").split("@")[-1]
            execution = ActionExecution(
                approval_id=approval.id, user_id=approval.user_id, state="executing", attempt_count=1,
                rfc822_message_id=f"<mailpilot-{approval.id}@{domain}>",
            )
            s.add(execution)
        else:
            execution.state = "executing"
            execution.attempt_count += 1
            execution.started_at = now
            execution.error = None
        await s.flush()
        retrying = recovering or execution.attempt_count > 1
        return approval, execution, retrying


def _set_exec(s: Any, execution: ActionExecution | None, approval: ActionApproval, state: str, *,
              error: str | None = None) -> None:
    if execution is None:
        execution = ActionExecution(approval_id=approval.id, user_id=approval.user_id, state=state)
        s.add(execution)
    execution.state = state
    execution.error = error
    execution.finished_at = datetime.now(UTC)


async def _ensure_label(gmail: GmailClient, account_id: UUID, user_id: UUID, name: str) -> str:
    async with system_session() as s:
        existing = (await s.execute(select(GmailLabel.label_id).where(
            GmailLabel.account_id == account_id, GmailLabel.name == name))).scalar_one_or_none()
    if existing:
        return existing
    labels = (await gmail.list_labels()).get("labels", [])
    for label in labels:
        if label.get("name") == name:
            return label["id"]
    created = await gmail.create_label(name)
    async with system_session() as s:
        s.add(GmailLabel(account_id=account_id, user_id=user_id, label_id=created["id"], name=name))
    return created["id"]


async def _perform(gmail: GmailClient, approval: ActionApproval, execution: ActionExecution,
                   retrying: bool) -> dict[str, Any]:
    p = approval.params
    if approval.action_type == ActionType.send_reply:
        rfc_id = execution.rfc822_message_id or f"<mailpilot-{approval.id}@mailpilot.local>"
        if retrying:
            existing = await gmail.find_by_rfc822_id(rfc_id)
            if existing:
                return {"gmail_message_id": existing, "deduplicated": True}
        sent = await gmail.send_raw(build_mime(p, rfc_id), p.get("gmail_thread_id"))
        return {"gmail_message_id": sent.get("id"), "gmail_thread_id": sent.get("threadId")}

    ids: list[str] = p["gmail_message_ids"]
    add: list[str] = []
    remove: list[str] = []
    if approval.action_type == ActionType.archive:
        remove = ["INBOX"]
    elif approval.action_type == ActionType.mark_read:
        remove = ["UNREAD"]
    elif approval.action_type == ActionType.mark_unread:
        add = ["UNREAD"]
    else:
        label_id = await _ensure_label(gmail, approval.account_id, approval.user_id, p["label_name"])
        (add if approval.action_type == ActionType.apply_label else remove).append(label_id)
    done, failed = [], []
    for mid in ids:
        try:
            await gmail.modify_message(mid, add=add, remove=remove)
            done.append(mid)
        except GmailError as exc:
            if isinstance(exc, GmailAuthError):
                raise
            failed.append({"id": mid, "error": str(exc)[:200]})
    if failed and not done:
        raise GmailError(f"All {len(failed)} message updates failed")
    return {"modified": done, "failed": failed, "add": add, "remove": remove}


async def execute_approval(approval_id: UUID, gmail: GmailClient | None = None) -> ActionApproval | None:
    claimed = await _claim_for_execution(approval_id)
    if claimed is None:
        async with system_session() as s:
            return await s.get(ActionApproval, approval_id)
    approval, execution, retrying = claimed
    owns = gmail is None
    try:
        if gmail is None:
            from app.gmail.oauth import gmail_client_for

            gmail = await gmail_client_for(approval.account_id)
        result = await _perform(gmail, approval, execution, retrying)
        error = None
    except Exception as exc:  # recorded and surfaced; job layer decides about retries
        result, error = {"retryable": is_transient(exc)}, f"{type(exc).__name__}: {exc}"[:1000]
    finally:
        if owns and gmail is not None:
            await gmail.aclose()

    async with system_session() as s:
        row = (await s.execute(select(ActionApproval).where(ActionApproval.id == approval_id).with_for_update())).scalar_one()
        exe = (await s.execute(select(ActionExecution).where(ActionExecution.approval_id == approval_id))).scalar_one()
        partial = bool(result.get("failed"))
        if error is None:
            row.state = ApprovalState.SUCCEEDED
            exe.state, exe.result, exe.finished_at = "succeeded", result, datetime.now(UTC)
            exe.gmail_message_id = result.get("gmail_message_id")
            exe.error = f"{len(result['failed'])} message(s) failed" if partial else None
            if row.action_type == ActionType.send_reply and row.draft_id:
                await s.execute(update(Draft).where(Draft.id == row.draft_id).values(status=DraftStatus.sent))
            elif row.action_type in MAILBOX_ACTIONS:
                await _apply_local_labels(s, row, result)
            record_audit(s, user_id=row.user_id, actor="worker", event="action.succeeded",
                         entity_type="action_approval", entity_id=row.id,
                         details={"action": row.action_type.value, "deduplicated": bool(result.get("deduplicated")),
                                  "partial_failures": len(result.get("failed", []))})
        else:
            row.state = ApprovalState.FAILED
            exe.state, exe.error, exe.result, exe.finished_at = "failed", error, result, datetime.now(UTC)
            record_audit(s, user_id=row.user_id, actor="worker", event="action.failed",
                         entity_type="action_approval", entity_id=row.id,
                         details={"action": row.action_type.value, "error": error[:300]})
        await s.flush()
        await s.refresh(row)
        return row


async def _apply_local_labels(s: Any, approval: ActionApproval, result: dict[str, Any]) -> None:
    for gid in result.get("modified", []):
        msg = (await s.execute(select(EmailMessage).where(
            EmailMessage.account_id == approval.account_id, EmailMessage.gmail_message_id == gid))).scalar_one_or_none()
        if msg is None:
            continue
        labels = [lbl for lbl in msg.label_ids if lbl not in result.get("remove", [])]
        labels += [lbl for lbl in result.get("add", []) if lbl not in labels]
        msg.label_ids = labels
        msg.is_unread = "UNREAD" in labels
