"""Approval engine (exact-content binding, invalidation, duplicate-send prevention) and API authorization."""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select, text

from app.actions import drafts as draft_service
from app.actions import engine
from app.db.models import ActionApproval, ApprovalState, EmailMessage
from app.db.session import system_session
from app.errors import AppError, ConflictError, NotFoundError
from app.gmail.client import SCOPE_READONLY, SCOPE_SEND
from app.gmail.sync import sync_account
from tests.conftest import create_account, make_token
from tests.fakes import FakeGmail, gmail_message


async def _setup(user_id: uuid.UUID, scopes: list[str] | None = None) -> tuple[uuid.UUID, FakeGmail, uuid.UUID]:
    account = await create_account(user_id, scopes or [SCOPE_READONLY, SCOPE_SEND])
    gmail = FakeGmail([gmail_message("in1", thread_id="th1", subject="Budget", body="Can you confirm the budget?",
                                     sender="Priya <priya@example.org>")])
    await sync_account(account, gmail=gmail)  # type: ignore[arg-type]
    async with system_session() as s:
        mid = (await s.execute(select(EmailMessage.id).where(EmailMessage.account_id == account))).scalar_one()
    return account, gmail, mid


async def _draft(user_id: uuid.UUID, mid: uuid.UUID, body: str = "Confirmed, thanks.") -> uuid.UUID:
    draft = await draft_service.create_reply_draft(user_id, mid, use_ai=False)
    updated = await draft_service.update_draft(user_id, draft.id, expected_version=draft.version, body=body)
    return updated.id


async def test_send_flow_binds_exact_content_and_sends_once(user_a: uuid.UUID) -> None:
    _, gmail, mid = await _setup(user_a)
    draft_id = await _draft(user_a, mid)
    approval = await engine.request_send_approval(user_a, draft_id)
    assert approval.state == ApprovalState.PENDING_APPROVAL
    assert approval.params["to"] == ["priya@example.org"] and approval.params["subject"] == "Re: Budget"
    assert approval.params["in_reply_to"] == "<in1@example.org>" and approval.params["gmail_thread_id"] == "th1"

    with pytest.raises(ConflictError) as exc:
        await engine.approve(user_a, approval.id, "0" * 64)
    assert exc.value.code == "params_mismatch"

    approved = await engine.approve(user_a, approval.id, approval.params_hash)
    assert approved.state == ApprovalState.APPROVED and approved.approved_by == user_a

    done = await engine.execute_approval(approval.id, gmail=gmail)  # type: ignore[arg-type]
    assert done is not None and done.state == ApprovalState.SUCCEEDED
    assert len(gmail.sent) == 1 and gmail.sent[0]["thread_id"] == "th1"
    assert "In-Reply-To: <in1@example.org>" in gmail.sent[0]["raw"]

    again = await engine.execute_approval(approval.id, gmail=gmail)  # type: ignore[arg-type]
    assert again is not None and again.state == ApprovalState.SUCCEEDED and len(gmail.sent) == 1
    async with system_session() as s:
        execution = (await s.execute(text("select gmail_message_id from action_executions where approval_id = :a"),
                                     {"a": approval.id})).scalar_one()
        draft_status = (await s.execute(text("select status from drafts where id = :d"), {"d": draft_id})).scalar_one()
    assert execution == "sent-1" and draft_status == "sent"


async def test_editing_draft_invalidates_approval(user_a: uuid.UUID) -> None:
    _, gmail, mid = await _setup(user_a)
    draft_id = await _draft(user_a, mid)
    approval = await engine.request_send_approval(user_a, draft_id)
    await engine.approve(user_a, approval.id, approval.params_hash)
    async with system_session() as s:
        version = (await s.execute(text("select version from drafts where id = :d"), {"d": draft_id})).scalar_one()
    await draft_service.update_draft(user_a, draft_id, expected_version=version, body="Changed after approval")
    async with system_session() as s:
        row = await s.get(ActionApproval, approval.id)
    assert row is not None and row.state == ApprovalState.CANCELLED and row.decision_reason == "draft_modified"
    result = await engine.execute_approval(approval.id, gmail=gmail)  # type: ignore[arg-type]
    assert result is not None and result.state == ApprovalState.CANCELLED and gmail.sent == []


async def test_crash_after_delivery_does_not_resend(user_a: uuid.UUID) -> None:
    _, gmail, mid = await _setup(user_a)
    approval = await engine.request_send_approval(user_a, await _draft(user_a, mid))
    await engine.approve(user_a, approval.id, approval.params_hash)
    gmail.fail_send_after_delivery = True
    failed = await engine.execute_approval(approval.id, gmail=gmail)  # type: ignore[arg-type]
    assert failed is not None and failed.state == ApprovalState.FAILED and len(gmail.sent) == 1
    gmail.fail_send_after_delivery = False
    retried = await engine.execute_approval(approval.id, gmail=gmail)  # type: ignore[arg-type]
    assert retried is not None and retried.state == ApprovalState.SUCCEEDED
    assert len(gmail.sent) == 1  # found by deterministic Message-ID, not sent twice


async def test_stale_executing_state_recovers_without_duplicate(user_a: uuid.UUID) -> None:
    _, gmail, mid = await _setup(user_a)
    approval = await engine.request_send_approval(user_a, await _draft(user_a, mid))
    await engine.approve(user_a, approval.id, approval.params_hash)
    gmail.fail_send_after_delivery = True
    await engine.execute_approval(approval.id, gmail=gmail)  # type: ignore[arg-type]
    async with system_session() as s:  # simulate worker death mid-flight: state stuck in EXECUTING
        await s.execute(text("update action_approvals set state = 'EXECUTING' where id = :a"), {"a": approval.id})
        await s.execute(text("update action_executions set state = 'executing', started_at = now() - interval '10 minutes' "
                             "where approval_id = :a"), {"a": approval.id})
    gmail.fail_send_after_delivery = False
    recovered = await engine.execute_approval(approval.id, gmail=gmail)  # type: ignore[arg-type]
    assert recovered is not None and recovered.state == ApprovalState.SUCCEEDED and len(gmail.sent) == 1


async def test_other_users_cannot_approve_or_see(user_a: uuid.UUID, user_b: uuid.UUID) -> None:
    _, _, mid = await _setup(user_a)
    approval = await engine.request_send_approval(user_a, await _draft(user_a, mid))
    with pytest.raises(NotFoundError):
        await engine.approve(user_b, approval.id, approval.params_hash)
    with pytest.raises(NotFoundError):
        await engine.decide(user_b, approval.id, ApprovalState.REJECTED, None)
    with pytest.raises(NotFoundError):
        await draft_service.create_reply_draft(user_b, mid, use_ai=False)


async def test_expired_approval_cannot_be_approved(user_a: uuid.UUID) -> None:
    _, _, mid = await _setup(user_a)
    approval = await engine.request_send_approval(user_a, await _draft(user_a, mid))
    async with system_session() as s:
        await s.execute(text("update action_approvals set expires_at = :t where id = :a"),
                        {"t": datetime.now(UTC) - timedelta(minutes=1), "a": approval.id})
    with pytest.raises(ConflictError) as exc:
        await engine.approve(user_a, approval.id, approval.params_hash)
    assert exc.value.code == "approval_expired"


async def test_missing_send_scope_requires_upgrade_and_external_recipients_need_ack(user_a: uuid.UUID) -> None:
    _, _, mid = await _setup(user_a, [SCOPE_READONLY])
    draft_id = await _draft(user_a, mid)
    with pytest.raises(engine.PermissionUpgradeRequired):
        await engine.request_send_approval(user_a, draft_id)
    async with system_session() as s:
        await s.execute(text("update connected_accounts set granted_scopes = :g where user_id = :u"),
                        {"g": [SCOPE_READONLY, SCOPE_SEND], "u": user_a})
        version = (await s.execute(text("select version from drafts where id = :d"), {"d": draft_id})).scalar_one()
    await draft_service.update_draft(user_a, draft_id, expected_version=version, to=["stranger@elsewhere.example"])
    with pytest.raises(AppError) as exc:
        await engine.request_send_approval(user_a, draft_id)
    assert exc.value.code == "external_recipients_unconfirmed"
    approval = await engine.request_send_approval(user_a, draft_id, acknowledge_external_recipients=True)
    assert "outside the thread" in approval.explanation


async def test_draft_version_conflict(user_a: uuid.UUID) -> None:
    _, _, mid = await _setup(user_a)
    draft = await draft_service.create_reply_draft(user_a, mid, use_ai=False)
    await draft_service.update_draft(user_a, draft.id, expected_version=draft.version, body="v2")
    with pytest.raises(ConflictError):
        await draft_service.update_draft(user_a, draft.id, expected_version=draft.version, body="stale edit")


async def test_mailbox_action_proposal_and_execution(user_a: uuid.UUID) -> None:
    from app.db.models import ActionType
    from app.gmail.client import SCOPE_MODIFY

    _, gmail, mid = await _setup(user_a, [SCOPE_READONLY, SCOPE_MODIFY])
    approval = await engine.propose_mailbox_action(user_a, ActionType.apply_label, [mid], "MailPilot/Finance")
    await engine.approve(user_a, approval.id, approval.params_hash)
    done = await engine.execute_approval(approval.id, gmail=gmail)  # type: ignore[arg-type]
    assert done is not None and done.state == ApprovalState.SUCCEEDED
    assert gmail.modified and gmail.modified[0][1] == ["Label_2"]


# --- HTTP API: authentication, IDOR, search scoping, OAuth --------------------------------
async def test_api_requires_auth_and_hides_other_users_data(client, user_a: uuid.UUID, user_b: uuid.UUID) -> None:  # type: ignore[no-untyped-def]
    _, _, mid = await _setup(user_a)
    assert (await client.get("/api/v1/emails")).status_code == 401
    a_headers = {"Authorization": f"Bearer {make_token(user_a)}"}
    b_headers = {"Authorization": f"Bearer {make_token(user_b)}"}
    assert (await client.get(f"/api/v1/emails/{mid}", headers=a_headers)).status_code == 200
    resp = await client.get(f"/api/v1/emails/{mid}", headers=b_headers)
    assert resp.status_code == 404 and resp.json()["error"]["code"] == "not_found"
    assert (await client.get("/api/v1/emails", headers=b_headers)).json()["total"] == 0
    assert (await client.post("/api/v1/drafts", json={"message_id": str(mid), "use_ai": False},
                              headers=b_headers)).status_code == 404
    search = await client.post("/api/v1/search", json={"query": "budget"}, headers=b_headers)
    assert search.status_code == 200 and search.json()["results"] == []
    own = await client.post("/api/v1/search", json={"query": "budget"}, headers=a_headers)
    assert [r["id"] for r in own.json()["results"]] == [str(mid)]


async def test_api_ai_draft_reports_unavailable_inference(client, user_a: uuid.UUID) -> None:  # type: ignore[no-untyped-def]
    _, _, mid = await _setup(user_a)
    resp = await client.post("/api/v1/drafts", json={"message_id": str(mid)},
                             headers={"Authorization": f"Bearer {make_token(user_a)}"})
    assert resp.status_code == 400 and resp.json()["error"]["code"] == "llm_unavailable"


async def test_oauth_start_and_invalid_callback_state(client, user_a: uuid.UUID) -> None:  # type: ignore[no-untyped-def]
    resp = await client.post("/api/v1/gmail/oauth/start", json={"scope_set": "readonly"},
                             headers={"Authorization": f"Bearer {make_token(user_a)}"})
    url = resp.json()["authorization_url"]
    assert resp.status_code == 200 and "code_challenge_method=S256" in url and "gmail.readonly" in url
    assert "gmail.send" not in url and "access_type=offline" in url
    bad = await client.get("/api/v1/gmail/oauth/callback", params={"code": "x", "state": "forged"})
    assert bad.status_code == 302 and "oauth_error=invalid_oauth_state" in bad.headers["location"]
    denied = await client.get("/api/v1/gmail/oauth/callback", params={"error": "access_denied"})
    assert "oauth_error=access_denied" in denied.headers["location"]


async def test_rate_limit_on_sensitive_endpoint(client, user_a: uuid.UUID) -> None:  # type: ignore[no-untyped-def]
    from app.config import get_settings

    settings = get_settings()
    original = settings.sensitive_rate_limit_per_minute
    settings.sensitive_rate_limit_per_minute = 2
    try:
        headers = {"Authorization": f"Bearer {make_token(user_a)}"}
        codes = [(await client.post("/api/v1/search", json={"query": "anything"}, headers=headers)).status_code
                 for _ in range(3)]
        assert codes == [200, 200, 429]
    finally:
        settings.sensitive_rate_limit_per_minute = original


async def test_settings_optimistic_concurrency_and_validation(client, user_a: uuid.UUID) -> None:  # type: ignore[no-untyped-def]
    headers = {"Authorization": f"Bearer {make_token(user_a)}"}
    current = (await client.get("/api/v1/settings", headers=headers)).json()
    ok = await client.patch("/api/v1/settings", json={"version": current["version"], "timezone": "Asia/Kolkata",
                                                      "priority_thresholds": {"high": 75, "medium": 45}}, headers=headers)
    assert ok.status_code == 200 and ok.json()["timezone"] == "Asia/Kolkata"
    stale = await client.patch("/api/v1/settings", json={"version": current["version"], "timezone": "UTC"}, headers=headers)
    assert stale.status_code == 409
    bad = await client.patch("/api/v1/settings", json={"version": ok.json()["version"],
                                                       "priority_thresholds": {"high": 40, "medium": 60}}, headers=headers)
    assert bad.status_code == 422
