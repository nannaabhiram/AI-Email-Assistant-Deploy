"""Telegram mail assistant: webhook auth, finding and explaining mail, draft preview -> approve/rewrite/delete/undo."""

import json
import uuid
from typing import Any

import httpx
import respx
from sqlalchemy import select, text

from app.analysis.pipeline import analyze_message
from app.api.v1 import telegram as telegram_api
from app.config import get_settings
from app.db.models import ActionApproval, ApprovalState, EmailMessage, Job
from app.db.session import system_session
from app.gmail.client import SCOPE_READONLY, SCOPE_SEND
from app.gmail.sync import sync_account
from app.security.crypto import encrypt
from app.services import telegram as tg
from app.services import telegram_bot
from tests.conftest import create_account, make_token
from tests.fakes import FakeGmail, gmail_message

TOKEN = "123456789:" + "A" * 35
CHAT = 4242
API = f"https://api.telegram.org/bot{TOKEN}"


async def _link(user_id: uuid.UUID, secret: str = "s3cret") -> None:
    prefs = {tg.TOKEN_KEY: encrypt(TOKEN), tg.BOT_KEY: "mp_bot", tg.CHAT_KEY: CHAT, tg.HOOK_SECRET_KEY: secret,
             tg.HOOK_URL_KEY: "https://api.example/api/v1/telegram/webhook/x"}
    async with system_session() as s:
        await s.execute(text("update public.user_settings set notification_prefs = cast(:p as jsonb) where user_id = :u"),
                        {"p": json.dumps(prefs), "u": user_id})


async def _mailbox(user_id: uuid.UUID) -> uuid.UUID:
    account = await create_account(user_id, [SCOPE_READONLY, SCOPE_SEND])
    gmail = FakeGmail([gmail_message("m1", thread_id="t1", subject="Internship offer letter",
                                     body="We are pleased to offer you a summer internship. Please confirm by Friday.",
                                     sender="Acme HR <hr@acme.example>")])
    await sync_account(account, gmail=gmail)  # type: ignore[arg-type]
    async with system_session() as s:
        mid = (await s.execute(select(EmailMessage.id).where(EmailMessage.account_id == account))).scalar_one()
    await analyze_message(mid)
    return mid


def _mock() -> tuple[respx.MockRouter, list[tuple[str, dict[str, Any]]]]:
    calls: list[tuple[str, dict[str, Any]]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        method = request.url.path.rsplit("/", 1)[-1]
        calls.append((method, json.loads(request.content or b"{}")))
        return httpx.Response(200, json={"ok": True, "result": {"message_id": len(calls)} if method == "sendMessage" else True})

    router = respx.mock(assert_all_called=False)
    router.post(url__startswith=API).mock(side_effect=handler)
    return router, calls


def _sent(calls: list[tuple[str, dict[str, Any]]], method: str = "sendMessage") -> list[dict[str, Any]]:
    return [p for m, p in calls if m == method]


def _msg(textv: str) -> dict[str, Any]:
    return {"update_id": 1, "message": {"message_id": 10, "chat": {"id": CHAT, "type": "private"}, "text": textv}}


def _cb(data: str, message_id: int = 99) -> dict[str, Any]:
    return {"update_id": 2, "callback_query": {"id": "cb1", "data": data,
                                               "message": {"message_id": message_id, "chat": {"id": CHAT}}}}


async def test_webhook_requires_the_per_user_secret_and_queues_updates(client, user_a: uuid.UUID) -> None:  # type: ignore[no-untyped-def]
    await _link(user_a)
    url = f"/api/v1/telegram/webhook/{user_a}"
    assert (await client.post(url, json=_msg("hi"))).status_code == 403
    assert (await client.post(url, json=_msg("hi"), headers={"X-Telegram-Bot-Api-Secret-Token": "nope"})).status_code == 403
    ok = await client.post(url, json=_msg("hi"), headers={"X-Telegram-Bot-Api-Secret-Token": "s3cret"})
    assert ok.status_code == 200
    async with system_session() as s:
        job = (await s.execute(select(Job).where(Job.user_id == user_a, Job.job_type == "telegram_update"))).scalar_one()
    assert job.payload["update"]["message"]["text"] == "hi"
    assert telegram_api.router.prefix == "/api/v1/telegram"


async def test_find_describes_the_mail_and_ignores_other_chats(user_a: uuid.UUID) -> None:
    await _link(user_a)
    await _mailbox(user_a)
    router, calls = _mock()
    with router:
        other = _msg("show me the mail about internship offer")
        other["message"]["chat"]["id"] = 1
        assert (await telegram_bot.handle_update(user_a, other)) == {"ignored": "other_chat"}
        await telegram_bot.handle_update(user_a, _msg("show me the mail about internship offer"))
    out = _sent(calls)[-1]
    assert "Internship offer letter" in out["text"] and "hr@acme.example" in out["text"]
    assert "pleased to offer you a summer internship" in out["text"]
    assert out["reply_markup"]["inline_keyboard"][0][0]["callback_data"].startswith("y:")


async def test_compose_preview_rewrite_approve_and_undo(user_a: uuid.UUID) -> None:
    await _link(user_a)
    await create_account(user_a, [SCOPE_READONLY, SCOPE_SEND])
    router, calls = _mock()
    with router:
        await telegram_bot.handle_update(user_a, _msg("send mail to rahul@example.org saying i will come tomorrow 10am"))
        preview = _sent(calls)[-1]
        assert "Draft preview" in preview["text"] and "rahul@example.org" in preview["text"]
        assert "I will come tomorrow 10am." in preview["text"]  # AI offline: basic cleanup, labelled
        assert "only cleaned up" in preview["text"]
        buttons = [b["callback_data"] for row in preview["reply_markup"]["inline_keyboard"] for b in row]
        did = buttons[0].split(":")[1]
        assert buttons == [f"a:{did}", f"r:{did}", f"e:{did}", f"d:{did}"]

        await telegram_bot.handle_update(user_a, _cb(f"r:{did}"))
        assert _sent(calls, "editMessageText")[-1]["message_id"] == 99

        await telegram_bot.handle_update(user_a, _cb(f"a:{did}"))
        done = _sent(calls, "editMessageText")[-1]
        assert "Sending in 10 seconds" in done["text"] and "rahul@example.org" in done["text"]
        approval_id = done["reply_markup"]["inline_keyboard"][0][0]["callback_data"].split(":")[1]
        async with system_session() as s:
            approval = await s.get(ActionApproval, uuid.UUID(approval_id))
        assert approval is not None and approval.state == ApprovalState.APPROVED
        assert approval.params["to"] == ["rahul@example.org"]

        await telegram_bot.handle_update(user_a, _cb(f"a:{did}"))  # double tap: draft is gone
        assert "expired" in _sent(calls)[-1]["text"]

        await telegram_bot.handle_update(user_a, _cb(f"u:{approval_id}"))
        async with system_session() as s:
            approval = await s.get(ActionApproval, uuid.UUID(approval_id), populate_existing=True)
        assert approval is not None and approval.state == ApprovalState.CANCELLED
        assert "Draft preview" in _sent(calls, "editMessageText")[-1]["text"]


async def test_reply_to_found_mail_is_threaded_and_delete_sends_nothing(user_a: uuid.UUID) -> None:
    await _link(user_a)
    mid = await _mailbox(user_a)
    router, calls = _mock()
    with router:
        await telegram_bot.handle_update(user_a, _cb(f"o:{mid}"))
        await telegram_bot.handle_update(user_a, _cb(f"y:{mid}"))
        assert "What should I reply" in _sent(calls)[-1]["text"]
        await telegram_bot.handle_update(user_a, _msg("yes i accept, i can join monday"))
        preview = _sent(calls)[-1]
        assert "Reply preview" in preview["text"] and "Re: Internship offer letter" in preview["text"]
        did = preview["reply_markup"]["inline_keyboard"][0][0]["callback_data"].split(":")[1]
        state = (await telegram_bot._load(user_a))[0][tg.STATE_KEY]
        assert state["drafts"][did]["reply_to_message_id"] == str(mid)

        await telegram_bot.handle_update(user_a, _cb(f"d:{did}"))
        assert "Draft deleted" in _sent(calls, "editMessageText")[-1]["text"]
    async with system_session() as s:
        assert (await s.execute(select(ActionApproval).where(ActionApproval.user_id == user_a))).first() is None


async def test_unknown_recipient_asks_for_address(user_a: uuid.UUID) -> None:
    await _link(user_a)
    await create_account(user_a, [SCOPE_READONLY, SCOPE_SEND])
    router, calls = _mock()
    with router:
        await telegram_bot.handle_update(user_a, _msg("send mail to zorblax saying hello"))
        assert "full email address" in _sent(calls)[-1]["text"]
        await telegram_bot.handle_update(user_a, _msg("zorb@example.org"))
        assert "zorb@example.org" in _sent(calls)[-1]["text"] and "Draft preview" in _sent(calls)[-1]["text"]


async def test_polish_endpoint_falls_back_to_basic_cleanup(client, user_a: uuid.UUID) -> None:  # type: ignore[no-untyped-def]
    r = await client.post("/api/v1/compose/polish", json={"body": "i want leave tomorrow because fever"},
                          headers={"Authorization": f"Bearer {make_token(user_a)}"})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["source"] == "rules" and data["notice"] and "I want leave tomorrow because fever." in data["body"]


async def test_scheduler_finds_linked_bots_without_webhook(user_a: uuid.UUID, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    await _link(user_a)
    monkeypatch.setattr(get_settings(), "api_base_url", "https://api.example")
    assert user_a in await telegram_bot.users_needing_webhook()


async def test_after_the_undo_window_the_chat_shows_mail_sent(user_a: uuid.UUID) -> None:
    from app.actions import engine
    from app.jobs.handlers import handle_telegram_send_status

    await _link(user_a)
    await create_account(user_a, [SCOPE_READONLY, SCOPE_SEND])
    router, calls = _mock()
    with router:
        await telegram_bot.handle_update(user_a, _msg("send mail to rahul@example.org saying i will come at 5"))
        did = _sent(calls)[-1]["reply_markup"]["inline_keyboard"][0][0]["callback_data"].split(":")[1]
        await telegram_bot.handle_update(user_a, _cb(f"a:{did}"))
        async with system_session() as s:
            job = (await s.execute(select(Job).where(Job.user_id == user_a, Job.job_type == "telegram_send_status"))).scalar_one()
        assert job.payload["message_id"] == 99

        from app.jobs.handlers import RetryLater
        try:
            await handle_telegram_send_status(job.payload)
            raise AssertionError("should wait while the send is pending")
        except RetryLater:
            pass

        gmail = FakeGmail([])
        await engine.execute_approval(uuid.UUID(job.payload["approval_id"]), gmail=gmail)  # type: ignore[arg-type]
        assert len(gmail.sent) == 1
        await handle_telegram_send_status(job.payload)
    final = _sent(calls, "editMessageText")[-1]
    assert "Mail sent to rahul@example.org" in final["text"] and "come at 5" in final["text"].lower()
    assert final["reply_markup"] == {"inline_keyboard": []}  # Undo button removed
