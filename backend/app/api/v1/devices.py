"""Mobile device registration for push notifications."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel, Field
from sqlalchemy import update
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.api.deps import CurrentUserDep, SensitiveUserDep
from app.db.models import PushDevice
from app.db.session import system_session
from app.services.notify import notify

router = APIRouter(prefix="/api/v1/devices", tags=["devices"])
_TOKEN = r"^[A-Za-z0-9_:\-]{20,4096}$"


class DeviceIn(BaseModel):
    token: str = Field(pattern=_TOKEN)
    platform: Literal["android", "ios"]
    device_name: str | None = Field(default=None, max_length=120)
    app_version: str | None = Field(default=None, max_length=40)


class DeviceTokenIn(BaseModel):
    token: str = Field(pattern=_TOKEN)


@router.post("", status_code=204)
async def register_device(body: DeviceIn, user: CurrentUserDep) -> None:
    """Upsert by token: a phone that changes account is re-bound to the current user."""
    now = datetime.now(UTC)
    values = {"user_id": user.id, "platform": body.platform, "device_name": body.device_name,
              "app_version": body.app_version, "last_seen_at": now, "disabled_at": None}
    async with system_session() as s:
        await s.execute(pg_insert(PushDevice).values(token=body.token, **values)
                        .on_conflict_do_update(index_elements=["token"], set_=values))


@router.post("/unregister", status_code=204)
async def unregister_device(body: DeviceTokenIn, user: CurrentUserDep) -> None:
    async with system_session() as s:
        await s.execute(update(PushDevice).where(PushDevice.token == body.token,
                                                 PushDevice.user_id == user.id)
                        .values(disabled_at=datetime.now(UTC)))


@router.post("/test", status_code=202)
async def test_push(user: SensitiveUserDep) -> dict[str, bool]:
    async with system_session() as s:
        await notify(s, user.id, kind="system", title="MailPilot notifications are on",
                     body="You'll get alerts like this for offers and other important mail.",
                     link="/notifications", push=True)
    return {"queued": True}
