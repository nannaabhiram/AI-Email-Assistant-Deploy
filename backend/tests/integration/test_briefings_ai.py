"""Daily briefing generation with the DGX: AI narrative, labelled fallback with a reason, correct
activity window on regeneration, user isolation, the Generate now endpoint and worker liveness."""

import json
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import text

from app.analysis.briefing import generate_briefing
from app.api.v1 import health
from app.db.session import system_session
from app.llm.base import LLMUnavailableError
from app.llm.service import LLMService, get_settings
from tests.conftest import make_token
from tests.fakes import FakeProvider
from tests.integration.test_briefing_search import _mailbox

NARRATIVE = json.dumps({"headline": "Two security emails need attention",
                        "narrative": "A new sign-in alert and a laptop quotation arrived today.",
                        "recommended_actions": ["Check the new sign-in", "Confirm the quotation"]})


def _llm(*responses: str | Exception) -> tuple[LLMService, FakeProvider]:
    provider = FakeProvider(responses=list(responses))
    settings = get_settings().model_copy(update={"llm_max_retries": 0, "dgx_llm_model": "qwen2.5vl:7b"})
    return LLMService(provider, settings, record_metrics=False), provider


async def test_ai_briefing_uses_the_model_and_only_real_data(user_a: uuid.UUID) -> None:
    await _mailbox(user_a)
    llm, provider = _llm(NARRATIVE)
    run = await generate_briefing(user_a, llm=llm)
    assert run.source.value == "hybrid" and run.error is None
    assert run.narrative == "Two security emails need attention\n\nA new sign-in alert and a laptop quotation arrived today."
    assert run.content["llm_recommended_actions"] == ["Check the new sign-in", "Confirm the quotation"]
    assert run.content["changes"]["new_messages"] == 3  # counts come from the database, never from the model
    sent = provider.calls[0][0][-1].content
    assert "Quotation for 40 laptops" in sent and "UNTRUSTED" in sent  # real data, delimited as untrusted


async def test_unavailable_dgx_gives_labelled_rule_briefing_with_reason(user_a: uuid.UUID) -> None:
    await _mailbox(user_a)
    llm, _ = _llm(LLMUnavailableError("Cannot reach inference server: ConnectError"))
    run = await generate_briefing(user_a, llm=llm)
    assert run.source.value == "rules" and run.narrative is None
    assert run.error == "AI narrative unavailable (unavailable): Cannot reach inference server: ConnectError"
    assert run.content["changes"]["new_messages"] == 3 and run.content["top_emails"]

    ok, _ = _llm(NARRATIVE)  # regenerating once the DGX is back replaces it and clears the reason
    again = await generate_briefing(user_a, llm=ok)
    assert again.id == run.id and again.source.value == "hybrid" and again.error is None


async def test_unconfigured_inference_is_explained(user_a: uuid.UUID) -> None:
    run = await generate_briefing(user_a, llm=LLMService(None, record_metrics=False))
    assert run.source.value == "rules" and run.error == "AI narrative skipped: remote inference is not configured"


async def test_empty_window_reports_zero_without_inventing_content(user_a: uuid.UUID) -> None:
    run = await generate_briefing(user_a, llm=LLMService(None, record_metrics=False))
    c = run.content
    assert c["changes"] == {"new_messages": 0, "new_high": 0, "new_risky": 0, "tasks_completed": 0}
    assert c["top_emails"] == c["due_today"] == c["awaiting_reply"] == c["meetings"] == []


async def test_regenerating_today_keeps_the_window_since_the_previous_day(user_a: uuid.UUID) -> None:
    await _mailbox(user_a)
    yesterday = (datetime.now(UTC) - timedelta(days=1)).date()
    async with system_session() as s:  # yesterday's briefing ran 26 hours ago
        await s.execute(text("insert into briefing_runs (user_id, briefing_date, source, created_at) "
                             "values (:u, :d, 'rules', now() - interval '26 hours')"), {"u": user_a, "d": yesterday})
    first = await generate_briefing(user_a, llm=LLMService(None, record_metrics=False))
    second = await generate_briefing(user_a, llm=LLMService(None, record_metrics=False))  # "Generate now" again
    # Previously the second run counted only mail since the first run minutes earlier, i.e. zero.
    assert first.content["changes"]["new_messages"] == second.content["changes"]["new_messages"] == 3
    assert datetime.fromisoformat(second.content["since"]) < datetime.now(UTC) - timedelta(hours=25)


async def test_briefing_only_counts_the_users_own_mail(user_a: uuid.UUID, user_b: uuid.UUID) -> None:
    await _mailbox(user_b)
    run = await generate_briefing(user_a, llm=LLMService(None, record_metrics=False))
    assert run.content["changes"]["new_messages"] == 0 and run.content["top_emails"] == []


async def test_generate_now_reuses_the_pending_job(client, user_a: uuid.UUID, user_b: uuid.UUID) -> None:  # type: ignore[no-untyped-def]
    a = {"Authorization": f"Bearer {make_token(user_a)}"}
    first = (await client.post("/api/v1/briefings/generate", headers=a)).json()
    second = (await client.post("/api/v1/briefings/generate", headers=a)).json()
    assert first["status"] == "queued" and second == {"job_id": first["job_id"], "status": "already_queued", "detail": None}
    other = (await client.post("/api/v1/briefings/generate", headers={"Authorization": f"Bearer {make_token(user_b)}"})).json()
    assert other["status"] == "queued" and other["job_id"] != first["job_id"]
    job = (await client.get(f"/api/v1/jobs/{first['job_id']}", headers=a)).json()
    assert job["job_type"] == "generate_briefing" and job["status"] == "queued"
    async with system_session() as s:  # leave no live jobs for the running worker
        await s.execute(text("delete from jobs where id in (:x, :y)"), {"x": first["job_id"], "y": other["job_id"]})


async def test_status_reports_a_stalled_worker(client, user_a: uuid.UUID, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    headers = {"Authorization": f"Bearer {make_token(user_a)}"}
    async with system_session() as s:
        job = (await s.execute(text("insert into jobs (job_type, payload, user_id, run_at) values "
                                    "('unit_test_job', '{}', :u, now() - interval '10 minutes') returning id"),
                               {"u": user_a})).scalar_one()
    try:
        monkeypatch.setattr(health, "WORKER_STALL_SECONDS", 1)
        # Recent activity from other tests counts as a live worker only within the window, so wait it out.
        async with system_session() as s:
            await s.execute(text("select pg_sleep(1.2)"))
        body = (await client.get("/api/v1/system/status", headers=headers)).json()
        if not body["worker"]["stalled"]:  # a real worker is processing jobs right now
            async with system_session() as s:
                running = (await s.execute(text("select count(*) from jobs where status = 'running' "
                                                "and locked_until > now()"))).scalar_one()
            assert running > 0
        assert body["worker"]["oldest_waiting_seconds"] >= 600

        async with system_session() as s:  # a job held by a live worker means it is not stalled
            await s.execute(text("update jobs set status = 'running', locked_by = 'w', locked_until = now() + "
                                 "interval '5 minutes' where id = :id"), {"id": job})
        body = (await client.get("/api/v1/system/status", headers=headers)).json()
        assert body["worker"]["stalled"] is False
    finally:
        async with system_session() as s:
            await s.execute(text("delete from jobs where id = :id"), {"id": job})


async def test_kolkata_preference_persists_and_schedules_0800_india_time(client, user_a: uuid.UUID) -> None:  # type: ignore[no-untyped-def]
    from app.jobs.handlers import schedule_briefings

    headers = {"Authorization": f"Bearer {make_token(user_a)}"}
    current = (await client.get("/api/v1/settings", headers=headers)).json()
    # Browsers list India as the legacy alias Asia/Calcutta; the API stores the IANA name.
    saved = await client.patch("/api/v1/settings", headers=headers, json={
        "version": current["version"], "timezone": "Asia/Calcutta", "briefing_time": "08:00:00", "briefing_enabled": True})
    assert saved.status_code == 200 and saved.json()["timezone"] == "Asia/Kolkata"
    reloaded = (await client.get("/api/v1/settings", headers=headers)).json()  # a page refresh
    assert reloaded["timezone"] == "Asia/Kolkata" and reloaded["briefing_time"] == "08:00:00"

    async with system_session() as s:
        assert await schedule_briefings(s, datetime(2027, 1, 15, 2, 29, tzinfo=UTC), [user_a]) == []  # 07:59 IST
        assert await schedule_briefings(s, datetime(2027, 1, 15, 2, 30, tzinfo=UTC), [user_a]) == [user_a]  # 08:00 IST
        key = (await s.execute(text("select dedupe_key from jobs where user_id = :u and job_type = 'generate_briefing'"),
                               {"u": user_a})).scalar_one()
        assert key == f"briefing:{user_a}:2027-01-15"
        assert await schedule_briefings(s, datetime(2027, 1, 15, 3, 30, tzinfo=UTC), [user_a]) == []  # once per day
        await s.execute(text("delete from jobs where user_id = :u and job_type = 'generate_briefing'"), {"u": user_a})
