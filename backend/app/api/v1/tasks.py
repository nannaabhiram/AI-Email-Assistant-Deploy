"""Tasks and commitments. Edits use optimistic concurrency (version) and run under RLS."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Query
from sqlalchemy import func, select, update

from app.api.deps import CurrentUserDep, Limit, Offset
from app.api.schemas import (
    CommitmentCreateIn,
    CommitmentOut,
    CommitmentUpdateIn,
    Page,
    TaskCreateIn,
    TaskOut,
    TaskUpdateIn,
)
from app.db.models import Commitment, EmailMessage, Feedback, Task
from app.db.session import user_session
from app.errors import ConflictError, NotFoundError

router = APIRouter(prefix="/api/v1", tags=["tasks"])


@router.get("/tasks", response_model=Page[TaskOut])
async def list_tasks(
    user: CurrentUserDep, limit: Limit = 100, offset: Offset = 0,
    status: list[Literal["suggested", "open", "done", "dismissed"]] | None = Query(default=None),
    due: Literal["overdue", "today", "upcoming", "none"] | None = None,
    source_message_id: UUID | None = None,
) -> Page[TaskOut]:
    now = datetime.now(UTC)
    conds = [Task.user_id == user.id]
    if status:
        conds.append(Task.status.in_(status))
    if source_message_id:
        conds.append(Task.source_message_id == source_message_id)
    if due == "overdue":
        conds += [Task.due_at < now, Task.status.in_(["open", "suggested"])]
    elif due == "today":
        conds += [Task.due_at >= func.date_trunc("day", func.now()), Task.due_at < func.date_trunc("day", func.now()) + func.make_interval(0, 0, 0, 1)]
    elif due == "upcoming":
        conds += [Task.due_at >= now]
    elif due == "none":
        conds.append(Task.due_at.is_(None))
    async with user_session(user.id) as s:
        total = (await s.execute(select(func.count()).select_from(Task).where(*conds))).scalar_one()
        rows = (await s.execute(select(Task).where(*conds).order_by(Task.due_at.asc().nulls_last(), Task.created_at.desc())
                                .limit(limit).offset(offset))).scalars().all()
    return Page(items=[TaskOut.model_validate(t) for t in rows], total=total, limit=limit, offset=offset)


@router.post("/tasks", response_model=TaskOut, status_code=201)
async def create_task(body: TaskCreateIn, user: CurrentUserDep) -> TaskOut:
    async with user_session(user.id) as s:
        thread_id = None
        if body.source_message_id:
            msg = await s.get(EmailMessage, body.source_message_id)
            if msg is None:
                raise NotFoundError("Source email not found")
            thread_id = msg.thread_id
        task = Task(user_id=user.id, title=body.title.strip(), description=body.description, due_at=body.due_at,
                    due_date_type="explicit" if body.due_at else "none", source_message_id=body.source_message_id,
                    source_thread_id=thread_id, status="open", created_by="user", reminder_at=body.reminder_at)
        s.add(task)
        await s.flush()
        await s.refresh(task)
        return TaskOut.model_validate(task)


@router.patch("/tasks/{task_id}", response_model=TaskOut)
async def update_task(task_id: UUID, body: TaskUpdateIn, user: CurrentUserDep) -> TaskOut:
    values: dict[str, object] = {}
    for field in ("title", "description", "status", "reminder_at"):
        if (v := getattr(body, field)) is not None:
            values[field] = v
    if body.due_at is not None:
        values.update(due_at=body.due_at, due_date_type="explicit", needs_confirmation=False)
    if body.clear_due:
        values.update(due_at=None, due_date_type="none")
    if body.status == "done":
        values["completed_at"] = datetime.now(UTC)
    elif body.status in ("open", "suggested"):
        values["completed_at"] = None
    if body.status == "open":
        values["needs_confirmation"] = False
    async with user_session(user.id) as s:
        current = await s.get(Task, task_id)
        if current is None:
            raise NotFoundError("Task not found")
        previous = {"title": current.title, "status": current.status.value,
                    "due_at": current.due_at.isoformat() if current.due_at else None}
        res = await s.execute(update(Task).where(Task.id == task_id, Task.version == body.version).values(**values)
                              .returning(Task.id))
        if res.scalar_one_or_none() is None:
            raise ConflictError("Task was modified elsewhere; reload and retry", code="version_conflict")
        if current.created_by != "user" and (body.title or body.due_at or body.clear_due or body.status == "dismissed"):
            s.add(Feedback(user_id=user.id, message_id=current.source_message_id, kind="task_correction",
                           previous_value=previous, new_value={k: str(v) for k, v in values.items()}))
        task = (await s.execute(select(Task).where(Task.id == task_id).execution_options(populate_existing=True))).scalar_one()
        return TaskOut.model_validate(task)


@router.delete("/tasks/{task_id}", status_code=204)
async def delete_task(task_id: UUID, user: CurrentUserDep) -> None:
    async with user_session(user.id) as s:
        task = await s.get(Task, task_id)
        if task is None:
            raise NotFoundError("Task not found")
        await s.delete(task)


@router.get("/commitments", response_model=Page[CommitmentOut])
async def list_commitments(
    user: CurrentUserDep, limit: Limit = 100, offset: Offset = 0,
    status: list[Literal["suggested", "open", "fulfilled", "cancelled"]] | None = Query(default=None),
    direction: Literal["by_me", "to_me"] | None = None,
) -> Page[CommitmentOut]:
    conds = [Commitment.user_id == user.id]
    if status:
        conds.append(Commitment.status.in_(status))
    if direction:
        conds.append(Commitment.direction == direction)
    async with user_session(user.id) as s:
        total = (await s.execute(select(func.count()).select_from(Commitment).where(*conds))).scalar_one()
        rows = (await s.execute(select(Commitment).where(*conds)
                                .order_by(Commitment.due_at.asc().nulls_last(), Commitment.created_at.desc())
                                .limit(limit).offset(offset))).scalars().all()
    return Page(items=[CommitmentOut.model_validate(c) for c in rows], total=total, limit=limit, offset=offset)


@router.post("/commitments", response_model=CommitmentOut, status_code=201)
async def create_commitment(body: CommitmentCreateIn, user: CurrentUserDep) -> CommitmentOut:
    async with user_session(user.id) as s:
        if body.source_message_id and await s.get(EmailMessage, body.source_message_id) is None:
            raise NotFoundError("Source email not found")
        c = Commitment(user_id=user.id, direction=body.direction, description=body.description.strip(),
                       counterparty=body.counterparty, due_at=body.due_at,
                       due_date_type="explicit" if body.due_at else "none",
                       source_message_id=body.source_message_id, status="open", created_by="user")
        s.add(c)
        await s.flush()
        await s.refresh(c)
        return CommitmentOut.model_validate(c)


@router.patch("/commitments/{commitment_id}", response_model=CommitmentOut)
async def update_commitment(commitment_id: UUID, body: CommitmentUpdateIn, user: CurrentUserDep) -> CommitmentOut:
    values: dict[str, object] = {k: v for k, v in {"description": body.description, "counterparty": body.counterparty,
                                                   "status": body.status}.items() if v is not None}
    if body.due_at is not None:
        values.update(due_at=body.due_at, due_date_type="explicit", needs_confirmation=False)
    if body.clear_due:
        values.update(due_at=None, due_date_type="none")
    if body.status == "open":
        values["needs_confirmation"] = False
    async with user_session(user.id) as s:
        res = await s.execute(update(Commitment).where(Commitment.id == commitment_id, Commitment.version == body.version)
                              .values(**values).returning(Commitment.id))
        if res.scalar_one_or_none() is None:
            if await s.get(Commitment, commitment_id) is None:
                raise NotFoundError("Commitment not found")
            raise ConflictError("Commitment was modified elsewhere; reload and retry", code="version_conflict")
        c = (await s.execute(select(Commitment).where(Commitment.id == commitment_id)
                             .execution_options(populate_existing=True))).scalar_one()
        return CommitmentOut.model_validate(c)


@router.delete("/commitments/{commitment_id}", status_code=204)
async def delete_commitment(commitment_id: UUID, user: CurrentUserDep) -> None:
    async with user_session(user.id) as s:
        c = await s.get(Commitment, commitment_id)
        if c is None:
            raise NotFoundError("Commitment not found")
        await s.delete(c)
