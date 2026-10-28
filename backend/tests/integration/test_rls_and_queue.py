"""Row Level Security and durable job-queue behaviour against the real Supabase schema."""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError, ProgrammingError

from app.db.models import Job, JobStatus
from app.db.session import system_session, user_session
from app.jobs.queue import claim, complete, enqueue, fail
from tests.conftest import create_account


async def _seed_message(user_id: uuid.UUID, account_id: uuid.UUID, subject: str = "Private") -> uuid.UUID:
    async with system_session() as s:
        thread = (await s.execute(text(
            "insert into email_threads (user_id, account_id, gmail_thread_id, subject) values (:u, :a, :g, :s) returning id"),
            {"u": user_id, "a": account_id, "g": uuid.uuid4().hex, "s": subject})).scalar_one()
        return (await s.execute(text(
            """insert into email_messages (user_id, account_id, thread_id, gmail_message_id, gmail_thread_id, subject,
               body_text, internal_date) values (:u, :a, :t, :g, :g, :s, 'secret body', now()) returning id"""),
            {"u": user_id, "a": account_id, "t": thread, "g": uuid.uuid4().hex, "s": subject})).scalar_one()


async def test_users_only_see_their_own_rows(user_a: uuid.UUID, user_b: uuid.UUID) -> None:
    acct_a, acct_b = await create_account(user_a), await create_account(user_b)
    msg_a = await _seed_message(user_a, acct_a, "Alice private")
    await _seed_message(user_b, acct_b, "Bob private")
    async with user_session(user_b) as s:
        subjects = (await s.execute(text("select subject from email_messages"))).scalars().all()
        assert subjects == ["Bob private"]
        assert (await s.execute(text("select count(*) from email_messages where id = :id"), {"id": msg_a})).scalar_one() == 0
        accounts = (await s.execute(text("select user_id from connected_accounts"))).scalars().all()
        assert set(accounts) == {user_b}


async def test_oauth_material_is_never_readable_by_users(user_a: uuid.UUID) -> None:
    await create_account(user_a)
    with pytest.raises(ProgrammingError):
        async with user_session(user_a) as s:
            await s.execute(text("select * from oauth_credentials"))


async def test_users_cannot_write_system_tables_or_forge_approvals(user_a: uuid.UUID) -> None:
    acct = await create_account(user_a)
    for stmt in (
        "insert into email_messages (user_id, account_id, thread_id, gmail_message_id, gmail_thread_id, internal_date) "
        "values (:u, :a, gen_random_uuid(), 'x', 'x', now())",
        "insert into action_approvals (user_id, account_id, action_type, params, params_hash, explanation, expires_at, "
        "idempotency_key) values (:u, :a, 'archive', '{}', 'h', 'e', now() + interval '1 day', gen_random_uuid()::text)",
        "insert into audit_logs (user_id, actor, event) values (:u, 'user', 'forged')",
    ):
        with pytest.raises(ProgrammingError):
            async with user_session(user_a) as s:
                await s.execute(text(stmt), {"u": user_a, "a": acct})


async def test_users_cannot_move_tasks_to_another_owner(user_a: uuid.UUID, user_b: uuid.UUID) -> None:
    async with user_session(user_a) as s:
        task_id = (await s.execute(text(
            "insert into tasks (user_id, title, created_by) values (:u, 'mine', 'user') returning id"), {"u": user_a})).scalar_one()
    with pytest.raises(ProgrammingError):  # user_id is not an updatable column for users
        async with user_session(user_a) as s:
            await s.execute(text("update tasks set user_id = :b where id = :id"), {"b": user_b, "id": task_id})
    async with user_session(user_b) as s:  # B cannot touch A's task at all
        res = await s.execute(text("update tasks set title = 'pwned' where id = :id"), {"id": task_id})
        assert res.rowcount == 0


async def test_anon_role_has_no_access() -> None:
    with pytest.raises(ProgrammingError):
        async with system_session() as s:
            await s.execute(text("set local role anon"))
            await s.execute(text("select * from email_messages limit 1"))


async def test_approval_state_machine_enforced_by_database(user_a: uuid.UUID) -> None:
    acct = await create_account(user_a)
    async with system_session() as s:
        approval_id = (await s.execute(text(
            """insert into action_approvals (user_id, account_id, action_type, params, params_hash, explanation, expires_at,
               idempotency_key) values (:u, :a, 'archive', cast(:p as jsonb), 'h', 'e', now() + interval '1 day',
               gen_random_uuid()::text) returning id"""), {"u": user_a, "a": acct, "p": '{"x": 1}'})).scalar_one()
    with pytest.raises(DBAPIError, match="illegal approval transition"):
        async with system_session() as s:
            await s.execute(text("update action_approvals set state = 'EXECUTING' where id = :id"), {"id": approval_id})
    with pytest.raises(DBAPIError, match="owning user"):
        async with system_session() as s:
            await s.execute(text("update action_approvals set state = 'APPROVED', approved_by = null where id = :id"),
                            {"id": approval_id})
    with pytest.raises(DBAPIError, match="immutable"):
        async with system_session() as s:
            await s.execute(text("update action_approvals set params = cast(:p as jsonb) where id = :id"),
                            {"p": '{"x": 2}', "id": approval_id})


async def test_job_dedupe_claim_lease_and_backoff(user_a: uuid.UUID) -> None:
    key = f"test:{uuid.uuid4()}"
    async with system_session() as s:
        first = await enqueue(s, "unit_test_job", {"n": 1}, user_id=user_a, dedupe_key=key, max_attempts=2)
        dup = await enqueue(s, "unit_test_job", {"n": 2}, user_id=user_a, dedupe_key=key)
    assert first is not None and dup is None

    async with system_session() as s:
        jobs = await claim(s, "w1", 10, 60, ["unit_test_job"])
    assert [j.id for j in jobs] == [first]
    async with system_session() as s:  # second worker cannot claim a leased job
        assert await claim(s, "w2", 10, 60, ["unit_test_job"]) == []

    async with system_session() as s:  # simulate a crashed worker: lease expires
        await s.execute(text("update jobs set locked_until = now() - interval '1 second' where id = :id"), {"id": first})
    async with system_session() as s:
        reclaimed = await claim(s, "w2", 10, 60, ["unit_test_job"])
    assert [j.id for j in reclaimed] == [first] and reclaimed[0].attempts == 2

    async with system_session() as s:
        status = await fail(s, reclaimed[0], "w2", "boom")
    assert status == JobStatus.dead  # max_attempts=2 reached

    async with system_session() as s:
        second = await enqueue(s, "unit_test_job", {}, user_id=user_a, dedupe_key=key)
        assert second is not None  # dedupe only applies to live jobs
        await s.execute(text("update jobs set run_at = now() + interval '1 hour' where id = :id"), {"id": second})
    async with system_session() as s:
        assert await claim(s, "w3", 10, 60, ["unit_test_job"]) == []  # not due yet
        await s.execute(text("update jobs set run_at = now() where id = :id"), {"id": second})
    async with system_session() as s:
        job = (await claim(s, "w3", 10, 60, ["unit_test_job"]))[0]
        await complete(s, job.id, "w3")
        row = await s.get(Job, job.id)
        assert row is not None and row.status == JobStatus.succeeded


async def test_retention_purges_old_messages(user_a: uuid.UUID) -> None:
    acct = await create_account(user_a)
    msg = await _seed_message(user_a, acct)
    async with system_session() as s:
        await s.execute(text("update user_settings set email_retention_days = 7 where user_id = :u"), {"u": user_a})
        await s.execute(text("update email_messages set internal_date = :d where id = :id"),
                        {"d": datetime.now(UTC) - timedelta(days=30), "id": msg})
        result = (await s.execute(text("select public.purge_expired_data()"))).scalar_one()
        assert result["deleted_messages"] >= 1
        assert (await s.execute(text("select count(*) from email_messages where id = :id"), {"id": msg})).scalar_one() == 0
