"""Recovering from a changed TOKEN_ENCRYPTION_KEY, and the inbox label filter."""

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import text

from app.db.models import AccountStatus, ConnectedAccount
from app.db.session import system_session
from app.gmail.oauth import revoke_and_disconnect
from app.gmail.sync import sync_account
from tests.conftest import create_account, make_token
from tests.fakes import FakeGmail, gmail_message

NOW_MS = int(datetime.now(UTC).timestamp() * 1000)


async def test_disconnect_works_when_stored_token_is_unreadable(user_a: uuid.UUID) -> None:
    account = await create_account(user_a)
    async with system_session() as s:
        await s.execute(text("insert into public.oauth_credentials (account_id, user_id, encrypted_refresh_token) "
                             "values (:a, :u, 'gAAAAA-encrypted-with-a-lost-key')"), {"a": account, "u": user_a})
    await revoke_and_disconnect(user_a, account, delete_data=False)
    async with system_session() as s:
        acc = await s.get(ConnectedAccount, account)
        left = (await s.execute(text("select count(*) from public.oauth_credentials where account_id = :a"),
                                {"a": account})).scalar_one()
    assert acc is not None and acc.status == AccountStatus.disconnected and left == 0


async def test_label_filter(user_a: uuid.UUID, client: Any) -> None:
    account = await create_account(user_a)
    await sync_account(account, gmail=FakeGmail([  # type: ignore[arg-type]
        gmail_message("l1", subject="In inbox", internal_ms=NOW_MS - 60_000),
        gmail_message("l2", subject="Starred only", internal_ms=NOW_MS - 60_000, labels=["STARRED"]),
    ]))
    headers = {"Authorization": f"Bearer {make_token(user_a)}"}
    body = (await client.get("/api/v1/emails", headers=headers, params={"label": "STARRED"})).json()
    assert [m["subject"] for m in body["items"]] == ["Starred only"]
