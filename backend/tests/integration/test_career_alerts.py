"""Internship/job offers are top priority, alert once, and reach the phone through ntfy."""

import time
import uuid

import httpx
import respx
from sqlalchemy import select

from app.analysis.pipeline import analyze_message
from app.db.models import EmailAnalysis, EmailMessage, Job, Notification
from app.db.session import system_session
from app.gmail.sync import sync_account
from app.jobs.handlers import handle_push_send
from tests.conftest import create_account, make_token
from tests.fakes import FakeGmail, gmail_message

NOW_MS = int(time.time() * 1000)


async def _sync(user: uuid.UUID, *msgs: dict) -> dict[str, uuid.UUID]:  # type: ignore[type-arg]
    account = await create_account(user)
    await sync_account(account, gmail=FakeGmail(list(msgs)))  # type: ignore[arg-type]
    async with system_session() as s:
        rows = (await s.execute(select(EmailMessage.gmail_message_id, EmailMessage.id)
                                .where(EmailMessage.account_id == account))).all()
    return {g: i for g, i in rows}


async def test_offer_is_high_and_alerts_once(user_a: uuid.UUID) -> None:
    ids = await _sync(user_a,
        gmail_message("offer", subject="Internship Offer - SDE Intern", sender="Acme HR <no-reply@acme.test>",
                      body="We are pleased to offer you the SDE internship. Your offer letter is attached.",
                      internal_ms=NOW_MS),
        gmail_message("old", subject="Offer letter", body="Your internship offer letter is attached.",
                      internal_ms=NOW_MS - 10 * 86_400_000),
        gmail_message("alert", subject="New internships for you", body="Recommended internships. Apply now.",
                      extra_headers={"List-Unsubscribe": "<mailto:u@jobs.test>"}, internal_ms=NOW_MS))
    for _ in range(2):  # re-analysis (e.g. LLM pass) must not alert twice
        for mid in ids.values():
            await analyze_message(mid, use_llm=False)
    async with system_session() as s:
        an = {r.message_id: r for r in (await s.execute(select(EmailAnalysis).where(EmailAnalysis.user_id == user_a))).scalars()}
        notes = (await s.execute(select(Notification).where(Notification.user_id == user_a,
                                                            Notification.kind == "important"))).scalars().all()
        pushes = (await s.execute(select(Job).where(Job.user_id == user_a, Job.job_type == "push_send"))).scalars().all()
    offer = an[ids["offer"]]
    assert (offer.priority, offer.category, offer.escalation_reason) == ("HIGH", "career", "career_opportunity")
    assert offer.priority_score >= 95
    assert an[ids["old"]].priority == "HIGH"  # backfilled offers still sort to the top...
    assert an[ids["alert"]].priority == "LOW"
    assert [n.link for n in notes] == [f"/emails/{ids['offer']}"]  # ...but only fresh mail pings the phone
    assert len(pushes) == 1 and pushes[0].payload["kind"] == "important"


@respx.mock
async def test_phone_alert_endpoints_and_ntfy_delivery(client, user_a: uuid.UUID) -> None:  # type: ignore[no-untyped-def]
    h = {"Authorization": f"Bearer {make_token(user_a)}"}
    assert (await client.get("/api/v1/settings/phone-alerts", headers=h)).json()["enabled"] is False
    on = (await client.post("/api/v1/settings/phone-alerts", headers=h)).json()
    assert on["enabled"] and on["subscribe_url"] == f"https://ntfy.sh/{on['topic']}"
    assert (await client.post("/api/v1/settings/phone-alerts", headers=h)).json()["topic"] == on["topic"]

    # Toggling other notification prefs keeps the topic.
    version = (await client.get("/api/v1/settings", headers=h)).json()["version"]
    resp = await client.patch("/api/v1/settings", headers=h, json={"version": version, "notification_prefs": {"briefing": False}})
    assert resp.json()["notification_prefs"]["ntfy_topic"] == on["topic"]

    route = respx.post(f"https://ntfy.sh/{on['topic']}").mock(return_value=httpx.Response(200))
    assert (await client.post("/api/v1/settings/phone-alerts/test", headers=h)).status_code == 204
    await handle_push_send({"user_id": str(user_a), "notification_id": "n", "title": "Career: Offer ✓",
                            "body": "From Acme", "link": "/emails/1", "kind": "important", "priority": "high"})
    req = route.calls[-1].request
    assert req.headers["Priority"] == "5" and req.headers["Click"].endswith("/emails/1")
    assert req.headers["Title"].startswith("=?UTF-8?B?") and req.content == b"From Acme"

    off = (await client.delete("/api/v1/settings/phone-alerts", headers=h)).json()
    assert (off["enabled"], off["topic"], off["subscribe_url"]) == (False, None, None)


@respx.mock
async def test_per_user_telegram_bot(client, user_a: uuid.UUID, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    import json as _json

    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "frontend_url", "https://mailpilot.test")
    token = "123456789:AAH" + "x" * 32
    api = f"https://api.telegram.org/bot{token}"
    respx.post(f"{api}/getMe").mock(return_value=httpx.Response(200, json={"ok": True, "result": {"username": "my_mp_bot"}}))
    respx.post(f"{api}/deleteWebhook").mock(return_value=httpx.Response(200, json={"ok": True, "result": True}))
    sent = respx.post(f"{api}/sendMessage").mock(return_value=httpx.Response(200, json={"ok": True, "result": {}}))
    updates = respx.post(f"{api}/getUpdates")
    h = {"Authorization": f"Bearer {make_token(user_a)}"}

    bad = await client.post("/api/v1/settings/phone-alerts/telegram", headers=h, json={"bot_token": "not-a-token-at-all-123"})
    assert bad.status_code == 400
    out = (await client.post("/api/v1/settings/phone-alerts/telegram", headers=h, json={"bot_token": token})).json()
    assert out["telegram_bot"] == "my_mp_bot" and not out["telegram_connected"]
    code = out["telegram_link"].split("start=")[1]
    assert out["telegram_link"] == f"https://t.me/my_mp_bot?start={code}"

    # Token and link code never leave the server.
    prefs = (await client.get("/api/v1/settings", headers=h)).json()["notification_prefs"]
    assert "telegram_bot_token_enc" not in prefs and "telegram_link_code" not in prefs and token not in str(prefs)

    updates.mock(return_value=httpx.Response(200, json={"ok": True, "result": [
        {"message": {"chat": {"id": 666, "type": "private"}, "text": "/start wrong"}}]}))
    assert (await client.post("/api/v1/settings/phone-alerts/telegram/verify", headers=h)).json()["telegram_connected"] is False
    updates.mock(return_value=httpx.Response(200, json={"ok": True, "result": [
        {"message": {"chat": {"id": 4242, "type": "private"}, "text": f"/start {code}"}}]}))
    assert (await client.post("/api/v1/settings/phone-alerts/telegram/verify", headers=h)).json()["telegram_connected"] is True

    assert (await client.post("/api/v1/settings/phone-alerts/test", headers=h)).status_code == 204
    await handle_push_send({"user_id": str(user_a), "notification_id": "n2", "title": "Career: Offer letter",
                            "body": "From Acme", "link": "/emails/9", "kind": "important", "priority": "high"})
    last = _json.loads(sent.calls[-1].request.content)
    assert last["chat_id"] == 4242 and "Career: Offer letter" in last["text"]
    assert last["reply_markup"]["inline_keyboard"][0][0]["url"] == "https://mailpilot.test/emails/9"

    off = (await client.delete("/api/v1/settings/phone-alerts/telegram", headers=h)).json()
    assert off["telegram_connected"] is False and off["telegram_bot"] is None
