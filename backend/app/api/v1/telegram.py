"""Webhook for each user's own Telegram bot (the mail assistant). Work is queued for the worker."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Header, Request, Response

from app.db.session import system_session
from app.jobs.queue import enqueue
from app.services.telegram_bot import webhook_secret_ok

router = APIRouter(prefix="/api/v1/telegram", tags=["telegram"])


@router.post("/webhook/{user_id}", include_in_schema=False)
async def webhook(user_id: UUID, request: Request,
                  x_telegram_bot_api_secret_token: str | None = Header(default=None)) -> Response:
    if not await webhook_secret_ok(user_id, x_telegram_bot_api_secret_token):
        return Response(status_code=403)
    try:
        update: dict[str, Any] = await request.json()
    except ValueError:
        return Response(status_code=200)
    if not isinstance(update, dict) or "update_id" not in update:
        return Response(status_code=200)
    async with system_session() as s:
        await enqueue(s, "telegram_update", {"user_id": str(user_id), "update": update}, user_id=user_id,
                      dedupe_key=f"tg:{user_id}:{update['update_id']}", priority=2, max_attempts=2)
    return Response(status_code=200)
