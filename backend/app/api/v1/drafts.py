"""Reply drafts and approval workflow endpoints."""

from __future__ import annotations

from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Query
from sqlalchemy import func, select

from app.actions import drafts as draft_service
from app.actions import engine
from app.api.deps import CurrentUserDep, Limit, Offset, SensitiveUserDep
from app.api.schemas import (
    ApprovalOut,
    ApproveIn,
    DecisionIn,
    DraftCreateIn,
    DraftDetailOut,
    DraftOut,
    DraftRegenerateIn,
    DraftUpdateIn,
    DraftVersionOut,
    ExecutionOut,
    Page,
    ProposeActionIn,
    RequestApprovalIn,
)
from app.db.models import (
    ActionApproval,
    ActionExecution,
    ActionType,
    ApprovalState,
    Draft,
    DraftVersion,
)
from app.db.session import user_session
from app.errors import NotFoundError

router = APIRouter(prefix="/api/v1", tags=["drafts & approvals"])


def _draft_out(d: Draft) -> DraftOut:
    out = DraftOut.model_validate(d)
    out.notes_for_user = getattr(d, "_notes", None)
    out.placeholders = getattr(d, "_placeholders", []) or []
    return out


@router.get("/drafts", response_model=Page[DraftOut])
async def list_drafts(user: CurrentUserDep, limit: Limit = 50, offset: Offset = 0,
                      status: list[Literal["draft", "pending_approval", "approved", "sent", "discarded"]] | None = Query(default=None)) -> Page[DraftOut]:
    conds = [Draft.user_id == user.id]
    conds.append(Draft.status.in_(status) if status else Draft.status != "discarded")
    async with user_session(user.id) as s:
        total = (await s.execute(select(func.count()).select_from(Draft).where(*conds))).scalar_one()
        rows = (await s.execute(select(Draft).where(*conds).order_by(Draft.updated_at.desc()).limit(limit).offset(offset))).scalars().all()
    return Page(items=[_draft_out(d) for d in rows], total=total, limit=limit, offset=offset)


@router.post("/drafts", response_model=DraftOut, status_code=201, summary="Create a reply draft (AI or blank)")
async def create_draft(body: DraftCreateIn, user: SensitiveUserDep) -> DraftOut:
    draft = await draft_service.create_reply_draft(user.id, body.message_id, body.tone, body.custom_tone,
                                                   body.instructions, use_ai=body.use_ai)
    return _draft_out(draft)


async def approval_out(s, approval: ActionApproval) -> ApprovalOut:  # type: ignore[no-untyped-def]
    out = ApprovalOut.model_validate(approval)
    execution = (await s.execute(select(ActionExecution).where(ActionExecution.approval_id == approval.id))).scalar_one_or_none()
    out.execution = ExecutionOut.model_validate(execution) if execution else None
    return out


@router.get("/drafts/{draft_id}", response_model=DraftDetailOut)
async def get_draft(draft_id: UUID, user: CurrentUserDep) -> DraftDetailOut:
    async with user_session(user.id) as s:
        d = await s.get(Draft, draft_id)
        if d is None:
            raise NotFoundError("Draft not found")
        versions = (await s.execute(select(DraftVersion).where(DraftVersion.draft_id == draft_id)
                                    .order_by(DraftVersion.version_no.desc()))).scalars().all()
        approvals = (await s.execute(select(ActionApproval).where(ActionApproval.draft_id == draft_id)
                                     .order_by(ActionApproval.created_at.desc()).limit(10))).scalars().all()
        out = DraftDetailOut.model_validate(d)
        out.versions = [DraftVersionOut.model_validate(v) for v in versions]
        out.approvals = [await approval_out(s, a) for a in approvals]
        return out


@router.patch("/drafts/{draft_id}", response_model=DraftOut, summary="Edit a draft (invalidates approvals)")
async def edit_draft(draft_id: UUID, body: DraftUpdateIn, user: CurrentUserDep) -> DraftOut:
    d = await draft_service.update_draft(user.id, draft_id, expected_version=body.version, to=body.to, cc=body.cc,
                                         subject=body.subject, body=body.body, tone=body.tone)
    return _draft_out(d)


@router.post("/drafts/{draft_id}/regenerate", response_model=DraftOut)
async def regenerate(draft_id: UUID, body: DraftRegenerateIn, user: SensitiveUserDep) -> DraftOut:
    return _draft_out(await draft_service.regenerate_draft(user.id, draft_id, body.tone, body.custom_tone,
                                                           body.instructions))


@router.delete("/drafts/{draft_id}", status_code=204)
async def discard(draft_id: UUID, user: CurrentUserDep) -> None:
    await draft_service.discard_draft(user.id, draft_id)


@router.post("/drafts/{draft_id}/request-approval", response_model=ApprovalOut, status_code=201)
async def request_approval(draft_id: UUID, body: RequestApprovalIn, user: SensitiveUserDep) -> ApprovalOut:
    approval = await engine.request_send_approval(user.id, draft_id, body.acknowledge_external_recipients)
    async with user_session(user.id) as s:
        return await approval_out(s, approval)


@router.post("/actions/propose", response_model=ApprovalOut, status_code=201,
             summary="Propose a label/archive/read-state change (requires approval)")
async def propose(body: ProposeActionIn, user: SensitiveUserDep) -> ApprovalOut:
    approval = await engine.propose_mailbox_action(user.id, ActionType(body.action_type), body.message_ids,
                                                   body.label_name)
    async with user_session(user.id) as s:
        return await approval_out(s, approval)


@router.get("/approvals", response_model=Page[ApprovalOut])
async def list_approvals(user: CurrentUserDep, limit: Limit = 50, offset: Offset = 0,
                         state: list[ApprovalState] | None = Query(default=None)) -> Page[ApprovalOut]:
    conds = [ActionApproval.user_id == user.id]
    if state:
        conds.append(ActionApproval.state.in_(state))
    async with user_session(user.id) as s:
        total = (await s.execute(select(func.count()).select_from(ActionApproval).where(*conds))).scalar_one()
        rows = (await s.execute(select(ActionApproval).where(*conds).order_by(ActionApproval.created_at.desc())
                                .limit(limit).offset(offset))).scalars().all()
        items = [await approval_out(s, a) for a in rows]
    return Page(items=items, total=total, limit=limit, offset=offset)


@router.get("/approvals/{approval_id}", response_model=ApprovalOut)
async def get_approval(approval_id: UUID, user: CurrentUserDep) -> ApprovalOut:
    async with user_session(user.id) as s:
        a = await s.get(ActionApproval, approval_id)
        if a is None:
            raise NotFoundError("Approval not found")
        return await approval_out(s, a)


@router.post("/approvals/{approval_id}/approve", response_model=ApprovalOut,
             summary="Approve the exact reviewed action (send/label/archive)")
async def approve(approval_id: UUID, body: ApproveIn, user: SensitiveUserDep) -> ApprovalOut:
    a = await engine.approve(user.id, approval_id, body.params_hash)
    async with user_session(user.id) as s:
        return await approval_out(s, a)


@router.post("/approvals/{approval_id}/reject", response_model=ApprovalOut)
async def reject(approval_id: UUID, body: DecisionIn, user: CurrentUserDep) -> ApprovalOut:
    a = await engine.decide(user.id, approval_id, ApprovalState.REJECTED, body.reason)
    async with user_session(user.id) as s:
        return await approval_out(s, a)


@router.post("/approvals/{approval_id}/cancel", response_model=ApprovalOut)
async def cancel(approval_id: UUID, body: DecisionIn, user: CurrentUserDep) -> ApprovalOut:
    a = await engine.decide(user.id, approval_id, ApprovalState.CANCELLED, body.reason)
    async with user_session(user.id) as s:
        return await approval_out(s, a)


@router.post("/approvals/{approval_id}/retry", response_model=ApprovalOut)
async def retry(approval_id: UUID, user: SensitiveUserDep) -> ApprovalOut:
    a = await engine.retry_failed(user.id, approval_id)
    async with user_session(user.id) as s:
        return await approval_out(s, a)
