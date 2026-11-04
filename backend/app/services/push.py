"""Mobile push delivery through Firebase Cloud Messaging HTTP v1 (Android + iOS via APNs)."""

from __future__ import annotations

import asyncio
import json
import time
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

import httpx
import jwt
from sqlalchemy import select, update

from app.config import get_settings
from app.db.models import PushDevice
from app.db.session import system_session
from app.logging import get_logger

log = get_logger(__name__)
_SCOPE = "https://www.googleapis.com/auth/firebase.messaging"
_DEAD_CODES = {"UNREGISTERED", "INVALID_ARGUMENT"}
_token_cache: dict[str, Any] = {"value": None, "exp": 0.0}
_token_lock = asyncio.Lock()


class PushTransientError(Exception):
    """FCM unreachable, throttled or failing; the job should retry."""


def _service_account() -> dict[str, Any] | None:
    raw = get_settings().fcm_service_account_json.get_secret_value().strip()
    return json.loads(raw) if raw else None


async def _access_token(client: httpx.AsyncClient, sa: dict[str, Any], *, force: bool = False) -> str:
    async with _token_lock:
        if not force and _token_cache["value"] and _token_cache["exp"] - 60 > time.time():
            return str(_token_cache["value"])
        now = int(time.time())
        token_uri = sa.get("token_uri", "https://oauth2.googleapis.com/token")
        assertion = jwt.encode({"iss": sa["client_email"], "scope": _SCOPE, "aud": token_uri, "iat": now,
                                "exp": now + 3600}, sa["private_key"], algorithm="RS256")
        try:
            resp = await client.post(token_uri, data={
                "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer", "assertion": assertion})
        except httpx.HTTPError as exc:
            raise PushTransientError(f"google token endpoint unreachable: {type(exc).__name__}") from exc
        if resp.status_code != 200:
            raise PushTransientError(f"google token endpoint status {resp.status_code}")
        body = resp.json()
        _token_cache.update(value=body["access_token"], exp=now + int(body.get("expires_in", 3600)))
        return str(body["access_token"])


def build_message(token: str, *, title: str, body: str | None, data: dict[str, Any], priority: str) -> dict[str, Any]:
    high = priority == "high"
    aps: dict[str, Any] = {"sound": "default"}
    if high:
        aps["interruption-level"] = "time-sensitive"
    return {"message": {
        "token": token,
        "notification": {"title": title[:178], "body": (body or "")[:400]},
        "data": {k: str(v) for k, v in data.items() if v is not None},
        "android": {"priority": "HIGH" if high else "NORMAL", "ttl": "86400s",
                    "notification": {"channel_id": "important" if high else "general", "sound": "default"}},
        "apns": {"headers": {"apns-priority": "10" if high else "5"}, "payload": {"aps": aps}},
    }}


def _error_code(resp: httpx.Response) -> str:
    try:
        err = resp.json().get("error", {})
    except ValueError:
        return ""
    for detail in err.get("details", []):
        if detail.get("errorCode"):
            return str(detail["errorCode"])
    return str(err.get("status", ""))


async def send_to_user(user_id: UUID, *, title: str, body: str | None, data: dict[str, Any],
                       priority: str = "high", http: httpx.AsyncClient | None = None) -> dict[str, int]:
    settings = get_settings()
    sa = _service_account()
    if not settings.push_enabled or sa is None:
        return {"sent": 0, "disabled": 0}
    async with system_session() as s:
        tokens = (await s.execute(select(PushDevice.token).where(
            PushDevice.user_id == user_id, PushDevice.disabled_at.is_(None)))).scalars().all()
    if not tokens:
        return {"sent": 0, "disabled": 0}

    url = f"{settings.fcm_api_base}/projects/{sa['project_id']}/messages:send"
    sent, dead, transient = 0, [], 0
    client = http or httpx.AsyncClient(timeout=15.0)
    try:
        access = await _access_token(client, sa)
        for token in tokens:
            message = build_message(token, title=title, body=body, data=data, priority=priority)
            try:
                resp = await client.post(url, json=message, headers={"Authorization": f"Bearer {access}"})
                if resp.status_code == 401:
                    access = await _access_token(client, sa, force=True)
                    resp = await client.post(url, json=message, headers={"Authorization": f"Bearer {access}"})
            except httpx.HTTPError:
                transient += 1
                continue
            if resp.status_code == 200:
                sent += 1
            elif resp.status_code in (404, 400) and _error_code(resp) in _DEAD_CODES:
                dead.append(token)
            elif resp.status_code == 429 or resp.status_code >= 500:
                transient += 1
            else:
                log.warning("push_rejected", status=resp.status_code, code=_error_code(resp))
    finally:
        if http is None:
            await client.aclose()
    if dead:
        async with system_session() as s:
            await s.execute(update(PushDevice).where(PushDevice.token.in_(dead)).values(disabled_at=datetime.now(UTC)))
    log.info("push_sent", sent=sent, disabled=len(dead), transient=transient)
    if transient and not sent:
        raise PushTransientError(f"{transient} device(s) failed transiently")
    return {"sent": sent, "disabled": len(dead)}
