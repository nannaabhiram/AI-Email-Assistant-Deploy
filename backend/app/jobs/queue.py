"""Postgres-backed durable job queue.

* Duplicate suppression: a partial unique index allows only one queued/running job per
  (job_type, dedupe_key).
* Crash safety: claimed jobs hold a lease (locked_until). If a worker dies, the lease
  expires and the job becomes claimable again.
* Retries: failures are rescheduled with exponential backoff until max_attempts, then
  marked 'dead' and surfaced on the dashboard.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

from sqlalchemy import text, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Job, JobStatus


async def enqueue(
    session: AsyncSession,
    job_type: str,
    payload: dict[str, Any],
    *,
    user_id: UUID | None = None,
    dedupe_key: str | None = None,
    priority: int = 100,
    run_at: datetime | None = None,
    max_attempts: int = 5,
) -> int | None:
    """Insert a job. Returns its id, or None if an identical live job already exists."""
    stmt = (
        pg_insert(Job)
        .values(
            job_type=job_type,
            payload=payload,
            user_id=user_id,
            dedupe_key=dedupe_key,
            priority=priority,
            run_at=run_at or datetime.now(UTC),
            max_attempts=max_attempts,
        )
        .on_conflict_do_nothing(
            index_elements=["job_type", "dedupe_key"],
            index_where=text("dedupe_key is not null and status in ('queued', 'running')"),
        )
        .returning(Job.id)
    )
    return (await session.execute(stmt)).scalar_one_or_none()


async def claim(
    session: AsyncSession, worker_id: str, limit: int, lease_seconds: int, job_types: list[str] | None = None
) -> list[Job]:
    result = await session.execute(
        text("select * from public.claim_jobs(:w, :n, :lease, :types)"),
        {"w": worker_id, "n": limit, "lease": lease_seconds, "types": job_types},
    )
    rows = result.mappings().all()
    return [Job(**{k: v for k, v in row.items()}) for row in rows]


async def complete(session: AsyncSession, job_id: int, worker_id: str) -> None:
    await session.execute(
        update(Job)
        .where(Job.id == job_id, Job.locked_by == worker_id)
        .values(status=JobStatus.succeeded, finished_at=datetime.now(UTC), locked_until=None, last_error=None)
    )


async def fail(
    session: AsyncSession, job: Job, worker_id: str, error: str, *, retryable: bool = True,
    min_delay: int = 0,
) -> JobStatus:
    if retryable and job.attempts < job.max_attempts:
        delay = min(3600, max(min_delay, 15 * (2 ** max(job.attempts - 1, 0))))
        status = JobStatus.queued
        values: dict[str, Any] = {"run_at": datetime.now(UTC) + timedelta(seconds=delay)}
    else:
        status = JobStatus.dead if retryable else JobStatus.failed
        values = {"finished_at": datetime.now(UTC)}
    await session.execute(
        update(Job)
        .where(Job.id == job.id, Job.locked_by == worker_id)
        .values(status=status, locked_until=None, last_error=error[:2000], **values)
    )
    return status


async def defer(session: AsyncSession, job: Job, worker_id: str, seconds: int, reason: str) -> None:
    """Reschedule without consuming an attempt (e.g. remote inference temporarily offline)."""
    await session.execute(
        update(Job)
        .where(Job.id == job.id, Job.locked_by == worker_id)
        .values(
            status=JobStatus.queued,
            attempts=Job.attempts - 1,
            run_at=datetime.now(UTC) + timedelta(seconds=seconds),
            locked_until=None,
            last_error=reason[:2000],
        )
    )
