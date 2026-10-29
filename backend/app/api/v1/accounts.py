"""Connected Gmail accounts, OAuth and synchronization endpoints."""

from __future__ import annotations

from urllib.parse import urlencode
from uuid import UUID

from fastapi import APIRouter, Query
from fastapi.responses import RedirectResponse
from sqlalchemy import select

from app.api.deps import CurrentUserDep, SensitiveUserDep
from app.api.schemas import (
    AccountOut,
    DisconnectIn,
    JobRef,
    OAuthStartIn,
    OAuthStartOut,
    SyncIn,
    SyncStateOut,
)
from app.config import get_settings
from app.db.models import AccountStatus, ConnectedAccount, GmailLabel, SyncState
from app.db.session import system_session, user_session
from app.errors import AppError, ConflictError, ForbiddenError, NotFoundError
from app.gmail.client import SCOPE_MODIFY, SCOPE_SEND, GmailAuthError
from app.gmail.oauth import (
    OAuthCallbackError,
    build_authorization_url,
    handle_callback,
    revoke_and_disconnect,
)
from app.jobs.queue import enqueue
from app.logging import get_logger
from app.services.audit import record_audit

router = APIRouter(prefix="/api/v1", tags=["accounts"])
log = get_logger(__name__)


def _account_out(account: ConnectedAccount, state: SyncState | None) -> AccountOut:
    out = AccountOut.model_validate(account)
    out.can_send = SCOPE_SEND in account.granted_scopes or SCOPE_MODIFY in account.granted_scopes
    out.can_modify = SCOPE_MODIFY in account.granted_scopes
    out.sync = SyncStateOut.model_validate(state) if state else None
    return out


@router.get("/accounts", response_model=list[AccountOut])
async def list_accounts(user: CurrentUserDep) -> list[AccountOut]:
    async with user_session(user.id) as s:
        rows = (await s.execute(
            select(ConnectedAccount, SyncState).join(SyncState, SyncState.account_id == ConnectedAccount.id, isouter=True)
            .where(ConnectedAccount.user_id == user.id).order_by(ConnectedAccount.created_at)
        )).all()
    return [_account_out(a, st) for a, st in rows]


@router.post("/gmail/oauth/start", response_model=OAuthStartOut, summary="Begin Gmail authorization")
async def oauth_start(body: OAuthStartIn, user: SensitiveUserDep) -> OAuthStartOut:
    if user.is_demo:
        # Real mail must never be mixed into the shared sample-data account.
        raise ForbiddenError("The demo account cannot connect a real mailbox. Sign in with your own account.",
                             code="demo_account")
    async with system_session() as s:
        url = await build_authorization_url(s, user.id, body.scope_set, body.redirect_path, body.login_hint)
        record_audit(s, user_id=user.id, event="gmail.oauth_started", details={"scope_set": body.scope_set})
    return OAuthStartOut(authorization_url=url)


@router.get("/gmail/oauth/callback", include_in_schema=True, summary="Google OAuth redirect target")
async def oauth_callback(
    code: str | None = Query(default=None, max_length=2048),
    state: str | None = Query(default=None, max_length=256),
    error: str | None = Query(default=None, max_length=200),
) -> RedirectResponse:
    """Called by Google. Identity is bound to the single-use state created by an authenticated user."""
    frontend = get_settings().frontend_url.rstrip("/")
    if error or not code or not state:
        reason = error or "missing_parameters"
        return RedirectResponse(f"{frontend}/settings/accounts?{urlencode({'oauth_error': reason})}", status_code=302)
    try:
        account_id, redirect_path = await handle_callback(code, state)
    except (OAuthCallbackError, GmailAuthError, AppError) as exc:
        log.warning("oauth_callback_failed", error_code=getattr(exc, "code", "error"))
        code_ = getattr(exc, "code", None) or getattr(exc, "reason", None) or "oauth_failed"
        return RedirectResponse(f"{frontend}/settings/accounts?{urlencode({'oauth_error': code_})}", status_code=302)
    return RedirectResponse(f"{frontend}{redirect_path}?{urlencode({'connected': str(account_id)})}", status_code=302)


async def _owned_account(user_id: UUID, account_id: UUID) -> ConnectedAccount:
    async with user_session(user_id) as s:
        account = await s.get(ConnectedAccount, account_id)
    if account is None or account.user_id != user_id:
        raise NotFoundError("Connected account not found")
    return account


@router.post("/accounts/{account_id}/sync", response_model=JobRef, status_code=202)
async def trigger_sync(account_id: UUID, body: SyncIn, user: SensitiveUserDep) -> JobRef:
    account = await _owned_account(user.id, account_id)
    if account.status != AccountStatus.active:
        raise ConflictError(f"Account is {account.status}; reconnect it first", code="account_inactive")
    async with system_session() as s:
        job_id = await enqueue(s, "gmail_sync", {"account_id": str(account_id), "mode": body.mode}, user_id=user.id,
                               dedupe_key=f"sync:{account_id}", priority=5)
        record_audit(s, user_id=user.id, event="gmail.sync_requested", entity_type="connected_account",
                     entity_id=account_id, details={"mode": body.mode})
    return JobRef(job_id=job_id, status="queued" if job_id else "already_queued")


@router.get("/accounts/{account_id}/sync-status", response_model=SyncStateOut)
async def sync_status(account_id: UUID, user: CurrentUserDep) -> SyncStateOut:
    await _owned_account(user.id, account_id)
    async with user_session(user.id) as s:
        state = await s.get(SyncState, account_id)
    if state is None:
        raise NotFoundError("No sync state yet")
    return SyncStateOut.model_validate(state)


@router.get("/accounts/{account_id}/labels")
async def list_labels(account_id: UUID, user: CurrentUserDep) -> list[dict[str, str]]:
    await _owned_account(user.id, account_id)
    async with user_session(user.id) as s:
        rows = (await s.execute(select(GmailLabel).where(GmailLabel.account_id == account_id)
                                .order_by(GmailLabel.label_type, GmailLabel.name))).scalars().all()
    return [{"id": r.label_id, "name": r.name, "type": r.label_type} for r in rows]


@router.post("/accounts/{account_id}/disconnect", status_code=204)
async def disconnect(account_id: UUID, body: DisconnectIn, user: SensitiveUserDep) -> None:
    await _owned_account(user.id, account_id)
    await revoke_and_disconnect(user.id, account_id, body.delete_data)
