"""Compose a new message, send it with an undo window, and autocomplete recipients."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field

from app.actions import compose
from app.api.deps import CurrentUserDep, SensitiveUserDep
from app.api.schemas import DraftOut

router = APIRouter(prefix="/api/v1/compose", tags=["compose"])


class ComposeSendIn(BaseModel):
    to: list[str] = Field(default_factory=list, max_length=100)
    cc: list[str] = Field(default_factory=list, max_length=100)
    bcc: list[str] = Field(default_factory=list, max_length=100)
    subject: str = Field(default="", max_length=998)
    body: str = Field(default="", max_length=100_000)
    undo_seconds: int = Field(default=compose.UNDO_DEFAULT, ge=compose.UNDO_MIN, le=compose.UNDO_MAX)
    account_id: UUID | None = None


class ComposeSendOut(BaseModel):
    approval_id: UUID
    draft_id: UUID
    state: str
    send_at: datetime


class RecipientSuggestion(BaseModel):
    email: str
    name: str | None
    is_vip: bool
    sent_count: int
    received_count: int
    last_contacted_at: datetime | None


class RecipientSuggestions(BaseModel):
    items: list[RecipientSuggestion]
    total: int


@router.post("/send", response_model=ComposeSendOut, status_code=202,
             summary="Send a new message after a short undo window")
async def send(body: ComposeSendIn, user: SensitiveUserDep) -> ComposeSendOut:
    r = await compose.send_composed(user.id, to=body.to, cc=body.cc, bcc=body.bcc, subject=body.subject,
                                    body=body.body, undo_seconds=body.undo_seconds, account_id=body.account_id)
    return ComposeSendOut(approval_id=r.approval.id, draft_id=r.draft_id, state=r.approval.state.value, send_at=r.send_at)


@router.post("/{approval_id}/undo", response_model=DraftOut, summary="Cancel a send during its undo window")
async def undo(approval_id: UUID, user: CurrentUserDep) -> DraftOut:
    return DraftOut.model_validate(await compose.undo_send(user.id, approval_id))


@router.get("/recipients", response_model=RecipientSuggestions,
            summary="Autocomplete recipients by email or name, ranked by recency and frequency")
async def recipients(user: CurrentUserDep, q: str = Query(min_length=1, max_length=200),
                     limit: int = Query(default=8, ge=1, le=20)) -> RecipientSuggestions:
    items, total = await compose.suggest_recipients(user.id, q, limit)
    return RecipientSuggestions(items=[RecipientSuggestion(**i) for i in items], total=total)
