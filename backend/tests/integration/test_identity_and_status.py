"""Account ownership: demo isolation, OAuth callback binding, and current-vs-historical sync failures."""

import uuid
from typing import Any
from urllib.parse import parse_qs, urlparse

import httpx
from sqlalchemy import select, text

from app.db.models import ConnectedAccount
from app.db.session import system_session
from app.errors import AppError
from app.gmail.client import SCOPE_READONLY
from app.gmail.oauth import build_authorization_url, handle_callback
from tests.conftest import TEST_DOMAIN, create_account, make_token


def _google(email: str) -> httpx.AsyncClient:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/profile"):
            return httpx.Response(200, json={"emailAddress": email, "historyId": "1"})
        if request.method == "POST":  # token endpoint
            return httpx.Response(200, json={"access_token": "at", "refresh_token": "rt", "expires_in": 3600,
                                             "scope": SCOPE_READONLY})
        return httpx.Response(200, json={})

    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


async def _start(user_id: uuid.UUID) -> str:
    async with system_session() as s:
        url = await build_authorization_url(s, user_id)
    return parse_qs(urlparse(url).query)["state"][0]


async def test_demo_account_is_flagged_and_cannot_connect_gmail(client, user_a: uuid.UUID) -> None:  # type: ignore[no-untyped-def]
    demo = {"Authorization": f"Bearer {make_token(user_a, app_metadata={'demo': True})}"}
    me = await client.get("/api/v1/me", headers=demo)
    assert me.status_code == 200 and me.json()["is_demo"] is True
    resp = await client.post("/api/v1/gmail/oauth/start", json={"scope_set": "readonly"}, headers=demo)
    assert resp.status_code == 403 and resp.json()["error"]["code"] == "demo_account"

    # user_metadata is editable by the user, so it must not be able to grant or remove demo status.
    normal = {"Authorization": f"Bearer {make_token(user_a, user_metadata={'demo': True})}"}
    assert (await client.get("/api/v1/me", headers=normal)).json()["is_demo"] is False
    ok = await client.post("/api/v1/gmail/oauth/start", json={"scope_set": "readonly"}, headers=normal)
    assert ok.status_code == 200


async def test_oauth_callback_binds_account_to_initiating_user(user_a: uuid.UUID, user_b: uuid.UUID) -> None:
    mailbox = f"mailbox-{uuid.uuid4().hex[:8]}@{TEST_DOMAIN}"
    state = await _start(user_a)
    async with _google(mailbox) as http:
        account_id, _ = await handle_callback("code", state, http)
        # The state is single use: replaying it (e.g. by another user) fails and attaches nothing.
        try:
            await handle_callback("code", state, http)
            raise AssertionError("replayed OAuth state was accepted")
        except AppError as exc:
            assert exc.code == "invalid_oauth_state"
    async with system_session() as s:
        rows = (await s.execute(select(ConnectedAccount.user_id, ConnectedAccount.id)
                                .where(ConnectedAccount.email_address == mailbox))).all()
    assert rows == [(user_a, account_id)]

    # The same mailbox connected by a second user becomes that user's own, separate account.
    async with _google(mailbox) as http:
        b_account, _ = await handle_callback("code", await _start(user_b), http)
    assert b_account != account_id
    async with system_session() as s:
        owner = (await s.execute(select(ConnectedAccount.user_id).where(ConnectedAccount.id == b_account))).scalar_one()
    assert owner == user_b


async def _job(user_id: uuid.UUID, status: str, key: str, minutes_ago: int, error: str | None = None) -> None:
    async with system_session() as s:
        await s.execute(text(
            """insert into public.jobs (job_type, payload, user_id, dedupe_key, status, attempts, last_error,
                                        updated_at, finished_at)
               values ('gmail_sync', '{}'::jsonb, :u, :k, cast(:st as job_status), 1, :e,
                       now() - make_interval(mins => :m), now() - make_interval(mins => :m))"""),
            {"u": user_id, "k": key, "st": status, "e": error, "m": minutes_ago})


async def test_status_reports_only_unresolved_job_failures(client, user_a: uuid.UUID) -> None:  # type: ignore[no-untyped-def]
    recovered = await create_account(user_a)
    broken = uuid.uuid4()  # another account's sync key
    await _job(user_a, "dead", f"sync:{recovered}", 30, "GmailRateLimitError: old failure")
    await _job(user_a, "succeeded", f"sync:{recovered}", 5)
    await _job(user_a, "dead", f"sync:{broken}", 10, "GmailError: still failing")
    body: dict[str, Any] = (await client.get(
        "/api/v1/system/status", headers={"Authorization": f"Bearer {make_token(user_a)}"})).json()
    assert [f["error"] for f in body["recent_job_failures"]] == ["GmailError: still failing"]
    assert body["jobs"]["dead"] == 2  # history is still counted, only the banner hides resolved failures


async def test_disconnecting_a_shared_mailbox_does_not_revoke_the_other_connection(
    user_a: uuid.UUID, user_b: uuid.UUID
) -> None:
    import respx

    from app.config import get_settings
    from app.db.models import OAuthCredential
    from app.gmail.oauth import revoke_and_disconnect

    mailbox = f"shared-{uuid.uuid4().hex[:8]}@{TEST_DOMAIN}"
    async with _google(mailbox) as http:
        old, _ = await handle_callback("code", await _start(user_a), http)
        new, _ = await handle_callback("code", await _start(user_b), http)

    with respx.mock(assert_all_called=False) as mock:
        revoke = mock.post(get_settings().google_oauth_revoke_url).respond(200)
        await revoke_and_disconnect(user_a, old, delete_data=True)
        assert not revoke.called  # Google would revoke user_b's grant too
        async with system_session() as s:
            assert await s.get(ConnectedAccount, old) is None
            still = await s.get(ConnectedAccount, new)
            assert still is not None and still.status == "active" and await s.get(OAuthCredential, new) is not None

        await revoke_and_disconnect(user_b, new, delete_data=False)
        assert revoke.called  # last connection: access is revoked at Google
