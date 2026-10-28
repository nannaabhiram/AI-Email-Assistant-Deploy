"""Daily briefing generation, reminders and natural-language search against the real schema."""

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select, text

from app.analysis.briefing import generate_briefing
from app.analysis.pipeline import analyze_message
from app.analysis.search import natural_language_search, rule_parse
from app.db.models import EmailMessage, Notification
from app.db.session import system_session, user_session
from app.gmail.sync import sync_account
from app.jobs.handlers import handle_reminders
from app.llm.service import LLMService
from tests.conftest import create_account
from tests.fakes import FakeGmail, gmail_message

NOW_MS = int(datetime.now(UTC).timestamp() * 1000)


async def _mailbox(user_id: uuid.UUID) -> None:
    account = await create_account(user_id)
    gmail = FakeGmail([
        gmail_message("b1", subject="Security alert: new sign-in", body="We detected a new sign-in to your account.",
                      internal_ms=NOW_MS - 3_600_000),
        gmail_message("b2", subject="Quotation for 40 laptops", internal_ms=NOW_MS - 7_200_000,
                      body="Attached is our quotation Q-2026-118 totalling INR 28,40,000. Can you confirm by tomorrow?",
                      sender="Adatum Sales <sales@adatum.example>"),
        gmail_message("b3", subject="Weekly digest", body="News of the week", internal_ms=NOW_MS - 1_800_000,
                      extra_headers={"List-Unsubscribe": "<mailto:u@news.example>"}),
    ])
    await sync_account(account, gmail=gmail)  # type: ignore[arg-type]
    async with system_session() as s:
        ids = (await s.execute(select(EmailMessage.id).where(EmailMessage.account_id == account))).scalars().all()
    for mid in ids:
        await analyze_message(mid, llm=LLMService(None, record_metrics=False))


async def test_briefing_generation_rule_based(user_a: uuid.UUID) -> None:
    await _mailbox(user_a)
    run = await generate_briefing(user_a, llm=LLMService(None, record_metrics=False))
    assert run.status == "succeeded" and run.source.value == "rules" and run.narrative is None
    subjects = [e["subject"] for e in run.content["top_emails"]]
    assert "Security alert: new sign-in" in subjects and "Weekly digest" not in subjects
    assert run.content["changes"]["new_messages"] == 3
    again = await generate_briefing(user_a, llm=LLMService(None, record_metrics=False))
    assert again.id == run.id  # idempotent per user and day
    async with system_session() as s:
        notes = (await s.execute(select(Notification).where(Notification.user_id == user_a, Notification.kind == "briefing"))).scalars().all()
    assert len(notes) == 1


async def test_reminders_fire_once_for_due_tasks(user_a: uuid.UUID) -> None:
    async with system_session() as s:
        await s.execute(text("insert into tasks (user_id, title, status, due_at, created_by) values (:u, 'Pay invoice', 'open', :d, 'user')"),
                        {"u": user_a, "d": datetime.now(UTC) - timedelta(hours=1)})
    await handle_reminders({})
    await handle_reminders({})
    async with system_session() as s:
        notes = (await s.execute(select(Notification.title).where(Notification.user_id == user_a))).scalars().all()
    assert notes == ["Overdue: Pay invoice"]


async def test_natural_language_search_paths(user_a: uuid.UUID, user_b: uuid.UUID) -> None:
    await _mailbox(user_a)
    llm = LLMService(None, record_metrics=False)
    async with user_session(user_a) as s:
        latest = await natural_language_search(s, user_a, "find the last quotation someone sent me", llm=llm)
        assert latest.parser == "rules" and [r["subject"] for r in latest.results] == ["Quotation for 40 laptops"]
        amount = await natural_language_search(s, user_a, "emails mentioning 28,40,000", llm=llm)
        assert [r["subject"] for r in amount.results] == ["Quotation for 40 laptops"]
        sender = await natural_language_search(s, user_a, "show messages from Adatum about quotation", llm=llm)
        assert sender.results and all(r["from_address"] == "sales@adatum.example" for r in sender.results)
        today = await natural_language_search(s, user_a, "which emails require a response today?", llm=llm)
        assert today.filters.get("requires_reply") is True and today.filters.get("due_today") is True
        commitments = await natural_language_search(s, user_a, "which commitments have I not completed?", llm=llm)
        assert commitments.target == "commitments"
    async with user_session(user_b) as s:
        other = await natural_language_search(s, user_b, "find the last quotation someone sent me", llm=llm)
        assert other.results == []


def test_rule_parser_extracts_structure() -> None:
    f = rule_parse('Show high-priority messages from Priya about "Q4 renewal" with attachments')
    assert f.priority == "HIGH" and f.sender == "Priya" and "Q4 renewal" in f.keywords and f.has_attachment


async def test_scheduler_respects_sync_interval_and_daily_retention(user_a: uuid.UUID) -> None:
    from app.jobs.handlers import schedule_periodic_jobs

    account = await create_account(user_a)
    async with system_session() as s:
        await s.execute(text("update sync_state set last_attempt_at = now() where account_id = :a"), {"a": account})
    await schedule_periodic_jobs()
    async with system_session() as s:
        syncs = (await s.execute(text("select count(*) from jobs where job_type = 'gmail_sync' and payload->>'account_id' = :a"),
                                 {"a": str(account)})).scalar_one()
        assert syncs == 0  # attempted just now: not due yet
        await s.execute(text("update sync_state set last_attempt_at = now() - interval '1 hour' where account_id = :a"), {"a": account})
        await s.execute(text("update jobs set status = 'succeeded' where job_type = 'retention_cleanup' and status = 'queued'"))
    await schedule_periodic_jobs()
    async with system_session() as s:
        syncs = (await s.execute(text("select count(*) from jobs where job_type = 'gmail_sync' and payload->>'account_id' = :a"),
                                 {"a": str(account)})).scalar_one()
        live_retention = (await s.execute(text(
            "select count(*) from jobs where job_type = 'retention_cleanup' and status in ('queued', 'running')"))).scalar_one()
    assert syncs == 1 and live_retention == 0
