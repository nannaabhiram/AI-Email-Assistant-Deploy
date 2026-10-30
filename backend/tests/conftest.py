"""Test configuration.

Unit tests need nothing external. Tests marked ``db`` run against the local Supabase
Postgres started with ``npx supabase start``; they are skipped (reported as blocked)
when it is not reachable. All data is synthetic.
"""

from __future__ import annotations

import asyncio
import os
import time
import uuid
from collections.abc import AsyncIterator
from typing import Any

import jwt
import pytest
from cryptography.fernet import Fernet

os.environ.setdefault("ENVIRONMENT", "test")
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://postgres:postgres@127.0.0.1:55322/postgres")
os.environ.setdefault("SUPABASE_URL", "http://127.0.0.1:55321")
os.environ["SUPABASE_JWT_SECRET"] = "test-only-jwt-secret-with-at-least-32-characters!!"
os.environ["TOKEN_ENCRYPTION_KEY"] = Fernet.generate_key().decode()
os.environ["DGX_LLM_API_BASE_URL"] = ""
os.environ["DGX_LLM_MODEL"] = ""
os.environ["GOOGLE_CLIENT_ID"] = "test-client-id.apps.googleusercontent.com"
os.environ["GOOGLE_CLIENT_SECRET"] = "test-client-secret"
os.environ["RATE_LIMIT_PER_MINUTE"] = "1000"
os.environ["SENSITIVE_RATE_LIMIT_PER_MINUTE"] = "1000"

from sqlalchemy import text  # noqa: E402

from app.config import get_settings  # noqa: E402
from app.db.session import get_sessionmaker, system_session  # noqa: E402
from app.llm.service import LLMService, set_llm_service  # noqa: E402

get_settings.cache_clear()
TEST_DOMAIN = "test.mailpilot"
_db_ok: bool | None = None


async def _database_available() -> bool:
    global _db_ok
    if _db_ok is None:
        try:
            async with get_sessionmaker()() as s:
                await asyncio.wait_for(s.execute(text("select 1 from public.profiles limit 1")), timeout=5)
            _db_ok = True
        except Exception:
            _db_ok = False
    return _db_ok


def pytest_collection_modifyitems(config: pytest.Config, items: list[pytest.Item]) -> None:
    for item in items:
        if "integration" in str(item.fspath):
            item.add_marker(pytest.mark.db)


@pytest.fixture(autouse=True)
async def _require_db(request: pytest.FixtureRequest) -> None:
    if request.node.get_closest_marker("db") and not await _database_available():
        pytest.skip("BLOCKED: local Supabase Postgres not reachable (run `npx supabase start`)")


@pytest.fixture(autouse=True)
def _no_llm() -> Any:
    """Default: no remote LLM (tests that need one install a fake provider)."""
    set_llm_service(LLMService(None, record_metrics=False))
    from app.security.ratelimit import limiter

    limiter.reset()
    yield
    set_llm_service(None)


async def create_user(label: str = "user") -> uuid.UUID:
    user_id = uuid.uuid4()
    async with system_session() as s:
        await s.execute(
            text("""insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                    raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change,
                    email_change_token_new, recovery_token)
                    values ('00000000-0000-0000-0000-000000000000', :id, 'authenticated', 'authenticated', :email, '',
                    now(), '{}', '{}', now(), now(), '', '', '', '')"""),
            {"id": user_id, "email": f"{label}-{user_id.hex[:8]}@{TEST_DOMAIN}"},
        )
    return user_id


async def create_account(user_id: uuid.UUID, scopes: list[str] | None = None) -> uuid.UUID:
    from app.gmail.client import SCOPE_READONLY

    async with system_session() as s:
        account_id = (await s.execute(
            text("""insert into public.connected_accounts (user_id, email_address, status, granted_scopes)
                    values (:u, :e, 'active', :scopes) returning id"""),
            {"u": user_id, "e": f"owner-{user_id.hex[:8]}@{TEST_DOMAIN}", "scopes": scopes or [SCOPE_READONLY]},
        )).scalar_one()
        await s.execute(text("insert into public.sync_state (account_id, user_id) values (:a, :u)"),
                        {"a": account_id, "u": user_id})
    return account_id


def make_token(user_id: uuid.UUID, *, expires_in: int = 600, role: str = "authenticated", aud: str = "authenticated",
               app_metadata: dict[str, Any] | None = None, user_metadata: dict[str, Any] | None = None) -> str:
    now = int(time.time())
    payload: dict[str, Any] = {"sub": str(user_id), "role": role, "aud": aud, "iat": now, "exp": now + expires_in,
                               "email": f"{user_id.hex[:8]}@{TEST_DOMAIN}",
                               "iss": get_settings().supabase_url.rstrip("/") + "/auth/v1"}
    if app_metadata is not None:
        payload["app_metadata"] = app_metadata
    if user_metadata is not None:
        payload["user_metadata"] = user_metadata
    return jwt.encode(payload, os.environ["SUPABASE_JWT_SECRET"], algorithm="HS256")


@pytest.fixture
async def user_a() -> uuid.UUID:
    return await create_user("alice")


@pytest.fixture
async def user_b() -> uuid.UUID:
    return await create_user("bob")


@pytest.fixture(scope="session", autouse=True)
async def _cleanup() -> AsyncIterator[None]:
    yield
    if _db_ok:
        async with system_session() as s:
            await s.execute(text("delete from auth.users where email like :p"), {"p": f"%@{TEST_DOMAIN}"})
            await s.execute(text("delete from public.jobs where user_id is null and job_type in "
                                 "('send_reminders','retention_cleanup','embed_documents')"))
    from app.db.session import dispose_engine

    await dispose_engine()


@pytest.fixture
async def client() -> AsyncIterator[Any]:
    import httpx

    from app.main import app

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as c:
        yield c
