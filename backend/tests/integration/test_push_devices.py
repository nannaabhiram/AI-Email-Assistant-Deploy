"""Mobile push: device registration, notify() dedupe, FCM delivery and dead-token cleanup."""

import json
import uuid

import httpx
import pytest
import respx
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from pydantic import SecretStr
from sqlalchemy import select

from app.config import get_settings
from app.db.models import Job, PushDevice
from app.db.session import system_session
from app.jobs.handlers import handle_push_send
from app.services import push as push_module
from app.services.notify import notify
from tests.conftest import make_token

FCM_URL = "https://fcm.googleapis.com/v1/projects/mp-test/messages:send"
TOKEN_URL = "https://oauth2.googleapis.com/token"


def _token(tag: str) -> str:
    return f"{tag}-fcm:APA91b{uuid.uuid4().hex}"


async def _push_jobs(user_id: uuid.UUID) -> list[Job]:
    async with system_session() as s:
        return list((await s.execute(select(Job).where(Job.user_id == user_id, Job.job_type == "push_send"))).scalars())


@pytest.fixture
def fcm_configured(monkeypatch: pytest.MonkeyPatch) -> None:
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pem = key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
                            serialization.NoEncryption()).decode()
    sa = {"project_id": "mp-test", "client_email": "push@mp-test.iam.gserviceaccount.com", "private_key": pem,
          "token_uri": TOKEN_URL}
    monkeypatch.setattr(get_settings(), "fcm_service_account_json", SecretStr(json.dumps(sa)))
    push_module._token_cache.update(value=None, exp=0.0)


async def test_register_validates_and_rebinds_token(client, user_a: uuid.UUID, user_b: uuid.UUID) -> None:  # type: ignore[no-untyped-def]
    token = _token("a")
    a = {"Authorization": f"Bearer {make_token(user_a)}"}
    b = {"Authorization": f"Bearer {make_token(user_b)}"}
    bad = await client.post("/api/v1/devices", json={"token": "no spaces allowed here!", "platform": "android"}, headers=a)
    assert bad.status_code == 422
    assert (await client.post("/api/v1/devices", json={"token": token, "platform": "android"}, headers=a)).status_code == 204
    assert (await client.post("/api/v1/devices", json={"token": token, "platform": "ios"}, headers=b)).status_code == 204
    async with system_session() as s:
        row = (await s.execute(select(PushDevice).where(PushDevice.token == token))).scalar_one()
    assert row.user_id == user_b and row.platform == "ios"

    # Another user cannot disable someone else's device.
    assert (await client.post("/api/v1/devices/unregister", json={"token": token}, headers=a)).status_code == 204
    async with system_session() as s:
        assert (await s.execute(select(PushDevice.disabled_at).where(PushDevice.token == token))).scalar_one() is None


async def test_notify_enqueues_one_push_per_dedupe_key(user_a: uuid.UUID) -> None:
    for _ in range(2):
        async with system_session() as s:
            await notify(s, user_a, kind="important", title="Offer: SWE Intern", body="From hr@acme.test",
                         link="/emails/x", dedupe_key="important:offer-1", push=True)
    async with system_session() as s:
        await notify(s, user_a, kind="system", title="quiet", dedupe_key="quiet-1")
    jobs = await _push_jobs(user_a)
    assert len(jobs) == 1 and jobs[0].payload["kind"] == "important" and jobs[0].payload["priority"] == "high"


async def test_push_is_a_noop_without_fcm_credentials(user_a: uuid.UUID) -> None:
    result = await handle_push_send({"user_id": str(user_a), "title": "t", "kind": "system"})
    assert result == {"sent": 0, "disabled": 0}


@respx.mock
async def test_push_send_delivers_and_disables_dead_tokens(user_a: uuid.UUID, fcm_configured: None) -> None:
    live, dead = _token("live"), _token("dead")
    async with system_session() as s:
        for t in (live, dead):
            s.add(PushDevice(user_id=user_a, token=t, platform="android"))
    sent: list[dict[str, object]] = []

    def fcm(request: httpx.Request) -> httpx.Response:
        assert request.headers["Authorization"] == "Bearer at-1"
        msg = json.loads(request.content)["message"]
        sent.append(msg)
        if msg["token"] == live:
            return httpx.Response(200, json={"name": "projects/mp-test/messages/1"})
        return httpx.Response(404, json={"error": {"status": "NOT_FOUND", "details": [
            {"@type": "type.googleapis.com/google.firebase.fcm.v1.FcmError", "errorCode": "UNREGISTERED"}]}})

    respx.post(TOKEN_URL).mock(return_value=httpx.Response(200, json={"access_token": "at-1", "expires_in": 3600}))
    respx.post(FCM_URL).mock(side_effect=fcm)
    result = await handle_push_send({"user_id": str(user_a), "title": "Offer letter", "body": "Acme",
                                     "link": "/emails/1", "kind": "important", "priority": "high"})
    assert result == {"sent": 1, "disabled": 1}
    msg = next(m for m in sent if m["token"] == live)
    assert msg["android"]["priority"] == "HIGH" and msg["android"]["notification"]["channel_id"] == "important"
    assert msg["apns"]["payload"]["aps"]["interruption-level"] == "time-sensitive"
    assert msg["data"] == {"link": "/emails/1", "kind": "important"}
    async with system_session() as s:
        disabled = (await s.execute(select(PushDevice.token).where(
            PushDevice.user_id == user_a, PushDevice.disabled_at.is_not(None)))).scalars().all()
    assert disabled == [dead]


@respx.mock
async def test_push_send_retries_when_fcm_is_down(user_a: uuid.UUID, fcm_configured: None) -> None:
    from app.jobs.handlers import RetryAfter
    async with system_session() as s:
        s.add(PushDevice(user_id=user_a, token=_token("x"), platform="ios"))
    respx.post(TOKEN_URL).mock(return_value=httpx.Response(200, json={"access_token": "at-1", "expires_in": 3600}))
    respx.post(FCM_URL).mock(return_value=httpx.Response(503))
    with pytest.raises(RetryAfter):
        await handle_push_send({"user_id": str(user_a), "title": "t", "kind": "important"})
