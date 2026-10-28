"""Database engine and transaction scopes.

Two scopes are used:

* ``system_session`` - privileged connection (bypasses RLS). Used by workers and by
  trusted backend code that must write system-owned tables. Every query that touches
  user data still filters by an explicit, verified ``user_id``.
* ``user_session`` - the same connection, but the transaction switches to the
  ``authenticated`` role with the verified JWT claims, so Supabase RLS policies are
  enforced as a second line of defence for user-facing reads and edits.
"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.config import get_settings

_engine: AsyncEngine | None = None
_sessionmaker: async_sessionmaker[AsyncSession] | None = None


def get_engine() -> AsyncEngine:
    global _engine, _sessionmaker
    if _engine is None:
        settings = get_settings()
        url = settings.database_url.get_secret_value()
        if url.startswith("postgresql://"):
            url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
        _engine = create_async_engine(
            url,
            pool_size=settings.database_pool_size,
            max_overflow=settings.database_pool_size,
            pool_pre_ping=True,
            pool_recycle=1800,
            connect_args={
                "statement_cache_size": settings.database_statement_cache_size,
                "server_settings": {"application_name": "mailpilot"},
            },
        )
        _sessionmaker = async_sessionmaker(_engine, expire_on_commit=False)
    return _engine


def get_sessionmaker() -> async_sessionmaker[AsyncSession]:
    get_engine()
    assert _sessionmaker is not None
    return _sessionmaker


async def dispose_engine() -> None:
    global _engine, _sessionmaker
    if _engine is not None:
        await _engine.dispose()
    _engine = None
    _sessionmaker = None


@asynccontextmanager
async def system_session() -> AsyncIterator[AsyncSession]:
    async with get_sessionmaker()() as session:
        try:
            yield session
            await session.commit()
        except BaseException:
            await session.rollback()
            raise


async def apply_user_scope(session: AsyncSession, user_id: UUID) -> None:
    claims = json.dumps({"sub": str(user_id), "role": "authenticated"})
    await session.execute(text("select set_config('request.jwt.claims', :claims, true)"), {"claims": claims})
    await session.execute(text("set local role authenticated"))


@asynccontextmanager
async def user_session(user_id: UUID) -> AsyncIterator[AsyncSession]:
    """Transaction executed as the Supabase ``authenticated`` role for ``user_id``."""
    async with get_sessionmaker()() as session:
        try:
            await apply_user_scope(session, user_id)
            yield session
            await session.commit()
        except BaseException:
            await session.rollback()
            raise


async def check_database() -> bool:
    async with get_sessionmaker()() as session:
        await session.execute(text("select 1"))
    return True
