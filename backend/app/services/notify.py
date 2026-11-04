"""Create an in-app notification and, optionally, push it to the user's phones."""

from __future__ import annotations

from typing import Literal
from uuid import UUID

from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Notification
from app.jobs.queue import enqueue

Kind = Literal["reminder", "briefing", "sync", "approval", "system", "important"]


async def notify(
    s: AsyncSession,
    user_id: UUID,
    *,
    kind: Kind,
    title: str,
    body: str | None = None,
    link: str | None = None,
    dedupe_key: str | None = None,
    push: bool = False,
    push_priority: Literal["high", "normal"] = "high",
) -> UUID | None:
    """Insert once per (user, dedupe_key). Push is enqueued only for a newly created notification."""
    notification_id = (await s.execute(
        pg_insert(Notification).values(
            user_id=user_id, kind=kind, title=title[:200], body=body, link=link, dedupe_key=dedupe_key,
        ).on_conflict_do_nothing().returning(Notification.id)
    )).scalar_one_or_none()
    if notification_id is not None and push:
        await enqueue(s, "push_send", {
            "user_id": str(user_id), "notification_id": str(notification_id), "title": title[:200],
            "body": body, "link": link, "kind": kind, "priority": push_priority,
        }, user_id=user_id, dedupe_key=f"push:{notification_id}", priority=10, max_attempts=6)
    return notification_id
