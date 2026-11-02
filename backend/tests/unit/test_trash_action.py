from types import SimpleNamespace
from typing import Any, cast

import httpx
import respx

from app.actions.engine import _perform
from app.db.models import ActionApproval, ActionExecution, ActionType
from app.gmail.client import GmailClient, GmailError
from tests.fakes import FakeGmail


def _approval(action: ActionType, ids: list[str]) -> ActionApproval:
    return cast(ActionApproval, SimpleNamespace(action_type=action, params={"gmail_message_ids": ids}))


async def test_trash_moves_each_message_to_trash_without_modifying_labels() -> None:
    gmail = FakeGmail()
    result = await _perform(cast(Any, gmail), _approval(ActionType.trash, ["m1", "m2"]),
                            cast(ActionExecution, None), retrying=False)
    assert gmail.trashed == ["m1", "m2"]
    assert gmail.modified == []
    assert result == {"modified": ["m1", "m2"], "failed": [], "add": ["TRASH"], "remove": ["INBOX"]}


async def test_trash_reports_partial_failures() -> None:
    gmail = FakeGmail()

    async def flaky(mid: str) -> dict[str, Any]:
        if mid == "bad":
            raise GmailError("not found", 404)
        gmail.trashed.append(mid)
        return {"id": mid}

    gmail.trash_message = flaky  # type: ignore[method-assign, assignment]
    result = await _perform(cast(Any, gmail), _approval(ActionType.trash, ["ok", "bad"]),
                            cast(ActionExecution, None), retrying=False)
    assert result["modified"] == ["ok"]
    assert result["failed"][0]["id"] == "bad"


@respx.mock
async def test_client_trash_posts_to_trash_endpoint() -> None:
    route = respx.post("https://gmail.test/gmail/v1/users/me/messages/abc/trash").mock(
        return_value=httpx.Response(200, json={"id": "abc", "labelIds": ["TRASH"]}))

    async def token(_: bool) -> str:
        return "t"

    client = GmailClient(token, http=httpx.AsyncClient(), base_url="https://gmail.test/gmail/v1")
    assert (await client.trash_message("abc"))["labelIds"] == ["TRASH"]
    assert route.called
