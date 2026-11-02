"""Compose: send-now with undo window, Bcc delivery, permission checks and recipient autocomplete."""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import text

from app.actions import compose, engine
from app.db.models import ApprovalState
from app.db.session import system_session
from app.errors import AppError, ConflictError
from app.gmail.client import SCOPE_READONLY, SCOPE_SEND
from tests.conftest import create_account, make_token
from tests.fakes import FakeGmail


async def _send(user_id: uuid.UUID, **kw):  # type: ignore[no-untyped-def]
    args = {"to": ["Priya <Priya@Example.org>"], "cc": [], "bcc": ["boss@example.org"], "subject": "Hello",
            "body": "Hi Priya,\nSee you soon."} | kw
    return await compose.send_composed(user_id, **args)


async def test_send_is_scheduled_after_undo_window_then_delivered_once(user_a: uuid.UUID) -> None:
    await create_account(user_a, [SCOPE_READONLY, SCOPE_SEND])
    before = datetime.now(UTC)
    r = await _send(user_a, undo_seconds=10)
    assert r.approval.state == ApprovalState.APPROVED and r.approval.approved_by == user_a
    assert r.approval.params["to"] == ["priya@example.org"] and r.approval.params["bcc"] == ["boss@example.org"]
    assert r.approval.params["gmail_thread_id"] is None
    async with system_session() as s:
        run_at = (await s.execute(text("select run_at from jobs where dedupe_key = :k"),
                                  {"k": f"execute:{r.approval.id}"})).scalar_one()
    assert before + timedelta(seconds=9) < run_at < datetime.now(UTC) + timedelta(seconds=11)

    gmail = FakeGmail([])
    done = await engine.execute_approval(r.approval.id, gmail=gmail)  # type: ignore[arg-type]
    assert done is not None and done.state == ApprovalState.SUCCEEDED and len(gmail.sent) == 1
    raw = gmail.sent[0]["raw"]
    assert "To: priya@example.org" in raw and "Bcc: boss@example.org" in raw and "Subject: Hello" in raw
    assert gmail.sent[0]["thread_id"] is None
    async with system_session() as s:
        status = (await s.execute(text("select status from drafts where id = :d"), {"d": r.draft_id})).scalar_one()
        last = (await s.execute(text("select last_outbound_at, outbound_count from contacts where user_id = :u and email = :e"),
                                {"u": user_a, "e": "boss@example.org"})).one()
    assert status == "sent" and last.last_outbound_at is not None and last.outbound_count == 0


async def test_undo_cancels_before_execution(user_a: uuid.UUID) -> None:
    await create_account(user_a, [SCOPE_READONLY, SCOPE_SEND])
    r = await _send(user_a)
    draft = await compose.undo_send(user_a, r.approval.id)
    assert draft.status == "discarded" and draft.bcc_addresses == ["boss@example.org"]
    gmail = FakeGmail([])
    result = await engine.execute_approval(r.approval.id, gmail=gmail)  # type: ignore[arg-type]
    assert result is not None and result.state == ApprovalState.CANCELLED and gmail.sent == []
    with pytest.raises(ConflictError) as exc:
        await compose.undo_send(user_a, r.approval.id)
    assert exc.value.code == "already_sent"


async def test_undo_too_late_after_sending(user_a: uuid.UUID) -> None:
    await create_account(user_a, [SCOPE_READONLY, SCOPE_SEND])
    r = await _send(user_a)
    await engine.execute_approval(r.approval.id, gmail=FakeGmail([]))  # type: ignore[arg-type]
    with pytest.raises(ConflictError):
        await compose.undo_send(user_a, r.approval.id)


async def test_validation_and_permission(user_a: uuid.UUID) -> None:
    await create_account(user_a, [SCOPE_READONLY])
    with pytest.raises(engine.PermissionUpgradeRequired):
        await _send(user_a)
    with pytest.raises(AppError) as exc:
        await _send(user_a, to=["not-an-email"])
    assert exc.value.code == "invalid_recipient"
    with pytest.raises(AppError):
        await _send(user_a, to=[], bcc=[])


async def _contact(user_id: uuid.UUID, email: str, name: str | None, out: int, inn: int, days_ago: float | None) -> None:
    ts = datetime.now(UTC) - timedelta(days=days_ago) if days_ago is not None else None
    async with system_session() as s:
        await s.execute(text("""insert into contacts (user_id, email, display_name, domain, outbound_count, inbound_count,
                                last_outbound_at, last_inbound_at) values (:u, :e, :n, :d, :o, :i, :t, :t)"""),
                        {"u": user_id, "e": email, "n": name, "d": email.split("@")[1], "o": out, "i": inn, "t": ts})


async def test_recipient_suggestions_rank_by_match_recency_and_frequency(user_a: uuid.UUID, user_b: uuid.UUID) -> None:
    await _contact(user_a, "nanna.abhiram@klh.edu.in", "Nanna Abhiram", out=3, inn=5, days_ago=1)
    await _contact(user_a, "nanna.abhiram.old@gmail.com", "Abhiram N", out=1, inn=0, days_ago=200)
    await _contact(user_a, "abhinav@example.org", "Nanna Abhinav", out=40, inn=40, days_ago=2)
    await _contact(user_a, "someone@example.org", "Someone Else", out=50, inn=50, days_ago=0)
    await _contact(user_b, "nanna.abhiram@klh.edu.in", "Other user's contact", out=9, inn=9, days_ago=0)

    items, total = await compose.suggest_recipients(user_a, "nanna.abh")
    assert total == 3 and "someone@example.org" not in [i["email"] for i in items]
    # Exact prefix + recent use first; a stale address that matches better still loses to active contacts.
    assert [i["email"] for i in items] == ["nanna.abhiram@klh.edu.in", "abhinav@example.org", "nanna.abhiram.old@gmail.com"]

    typo, _ = await compose.suggest_recipients(user_a, "nanna.abiram")  # missing "h"
    assert typo and typo[0]["email"] == "nanna.abhiram@klh.edu.in"

    by_name, _ = await compose.suggest_recipients(user_a, "Nanna Abh")
    assert by_name[0]["email"] == "abhinav@example.org"  # name-prefix match + heavy recent use
    assert {i["email"] for i in by_name} == {"abhinav@example.org", "nanna.abhiram@klh.edu.in", "nanna.abhiram.old@gmail.com"}

    assert (await compose.suggest_recipients(user_a, "%_"))[0] == []
    assert "abhinav@example.org" not in [i["email"] for i in (await compose.suggest_recipients(user_b, "abhinav"))[0]]


async def test_compose_api(client, user_a: uuid.UUID, user_b: uuid.UUID) -> None:  # type: ignore[no-untyped-def]
    await create_account(user_a, [SCOPE_READONLY, SCOPE_SEND])
    await _contact(user_a, "nanna.abhiram@klh.edu.in", "Nanna Abhiram", out=3, inn=5, days_ago=1)
    a = {"Authorization": f"Bearer {make_token(user_a)}"}
    b = {"Authorization": f"Bearer {make_token(user_b)}"}
    sug = await client.get("/api/v1/compose/recipients", params={"q": "nanna.ab"}, headers=a)
    assert sug.status_code == 200 and sug.json()["items"][0]["name"] == "Nanna Abhiram"
    sent = await client.post("/api/v1/compose/send", headers=a,
                             json={"to": ["nanna.abhiram@klh.edu.in"], "subject": "Hi", "body": "Test", "undo_seconds": 5})
    assert sent.status_code == 202 and sent.json()["state"] == "APPROVED"
    aid = sent.json()["approval_id"]
    assert (await client.post(f"/api/v1/compose/{aid}/undo", headers=b)).status_code == 404
    undone = await client.post(f"/api/v1/compose/{aid}/undo", headers=a)
    assert undone.status_code == 200 and undone.json()["to_addresses"] == ["nanna.abhiram@klh.edu.in"]
    bad = await client.post("/api/v1/compose/send", headers=a, json={"to": ["x@y.z"], "body": "x", "undo_seconds": 90})
    assert bad.status_code == 422
