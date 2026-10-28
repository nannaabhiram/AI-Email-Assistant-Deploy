"""Mailbox synchronization: initial (bounded) sync and incremental sync via Gmail history."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.config import get_settings
from app.db.models import (
    AccountStatus,
    AnalysisStatus,
    ConnectedAccount,
    EmailMessage,
    GmailLabel,
    SyncState,
    UserSettings,
)
from app.db.session import system_session
from app.gmail.client import (
    GmailAuthError,
    GmailClient,
    GmailHistoryExpiredError,
    GmailNotFoundError,
)
from app.gmail.parser import parse_gmail_message
from app.gmail.store import refresh_thread_aggregates, upsert_message
from app.jobs.queue import enqueue
from app.logging import get_logger

log = get_logger(__name__)
BATCH = 50


@dataclass
class SyncResult:
    mode: str
    fetched: int = 0
    created: int = 0
    updated: int = 0
    deleted: int = 0
    new_message_ids: list[UUID] = field(default_factory=list)


class SyncSkipped(Exception):
    pass


async def _load_context(account_id: UUID) -> tuple[ConnectedAccount, SyncState, UserSettings]:
    async with system_session() as session:
        account = await session.get(ConnectedAccount, account_id)
        if account is None:
            raise SyncSkipped("account no longer exists")
        if account.status != AccountStatus.active:
            raise SyncSkipped(f"account status is {account.status}")
        state = await session.get(SyncState, account_id)
        if state is None:
            state = SyncState(account_id=account_id, user_id=account.user_id)
            session.add(state)
        settings = await session.get(UserSettings, account.user_id)
        if settings is None:
            settings = UserSettings(user_id=account.user_id)
            session.add(settings)
            await session.flush()
        state.status = "running"
        state.last_attempt_at = datetime.now(UTC)
        await session.flush()
        await session.refresh(settings)
        return account, state, settings


async def _fetch_many(gmail: GmailClient, ids: list[str], fmt: str) -> list[dict[str, Any]]:
    sem = asyncio.Semaphore(get_settings().gmail_fetch_concurrency)

    async def _one(mid: str) -> dict[str, Any] | None:
        async with sem:
            try:
                return await gmail.get_message(mid, fmt=fmt)
            except GmailNotFoundError:
                return None  # deleted between listing and fetching

    results = await asyncio.gather(*(_one(i) for i in ids))
    return [r for r in results if r is not None]


async def _store_full(
    account: ConnectedAccount, raw_messages: list[dict[str, Any]], result: SyncResult, auto_analyze: bool
) -> None:
    touched_threads: set[UUID] = set()
    async with system_session() as session:
        for raw in raw_messages:
            parsed = parse_gmail_message(raw)
            message_id, created = await upsert_message(session, account.user_id, account.id, parsed)
            if created:
                result.created += 1
                result.new_message_ids.append(message_id)
                thread_id = (
                    await session.execute(select(EmailMessage.thread_id).where(EmailMessage.id == message_id))
                ).scalar_one()
                touched_threads.add(thread_id)
                if auto_analyze:
                    await enqueue(session, "analyze_message", {"message_id": str(message_id)},
                                  user_id=account.user_id, dedupe_key=f"analyze:{message_id}", priority=50)
                    await session.execute(
                        update(EmailMessage).where(EmailMessage.id == message_id)
                        .values(analysis_status=AnalysisStatus.queued)
                    )
            else:
                result.updated += 1
        await refresh_thread_aggregates(session, touched_threads)


async def _apply_label_updates(account: ConnectedAccount, raw_minimal: list[dict[str, Any]]) -> int:
    async with system_session() as session:
        for raw in raw_minimal:
            labels = list(raw.get("labelIds") or [])
            await session.execute(
                update(EmailMessage)
                .where(EmailMessage.account_id == account.id, EmailMessage.gmail_message_id == raw["id"])
                .values(label_ids=labels, is_unread="UNREAD" in labels)
            )
    return len(raw_minimal)


async def _sync_labels(gmail: GmailClient, account: ConnectedAccount) -> None:
    data = await gmail.list_labels()
    async with system_session() as session:
        for label in data.get("labels", []):
            stmt = pg_insert(GmailLabel).values(
                account_id=account.id, user_id=account.user_id, label_id=label["id"],
                name=label.get("name", label["id"])[:200], label_type=label.get("type", "user"),
            )
            await session.execute(
                stmt.on_conflict_do_update(
                    index_elements=["account_id", "label_id"],
                    set_={"name": stmt.excluded.name, "label_type": stmt.excluded.label_type},
                )
            )


async def _existing_ids(account_id: UUID, ids: list[str]) -> set[str]:
    if not ids:
        return set()
    async with system_session() as session:
        rows = await session.execute(
            select(EmailMessage.gmail_message_id).where(
                EmailMessage.account_id == account_id, EmailMessage.gmail_message_id.in_(ids)
            )
        )
        return set(rows.scalars().all())


async def full_sync(gmail: GmailClient, account: ConnectedAccount, settings: UserSettings) -> tuple[SyncResult, str]:
    result = SyncResult(mode="full")
    profile = await gmail.get_profile()
    start_history = str(profile["historyId"])  # captured first so no change is missed
    query = f"newer_than:{settings.sync_lookback_days}d"
    page_token: str | None = None
    while result.fetched < settings.sync_max_messages:
        page = await gmail.list_messages(query=query, page_token=page_token,
                                         max_results=min(100, settings.sync_max_messages - result.fetched))
        ids = [m["id"] for m in page.get("messages", [])]
        result.fetched += len(ids)
        known = await _existing_ids(account.id, ids)
        new_ids = [i for i in ids if i not in known]
        for i in range(0, len(new_ids), BATCH):
            await _store_full(account, await _fetch_many(gmail, new_ids[i:i + BATCH], "full"), result,
                              settings.auto_analyze)
        known_list = list(known)
        for i in range(0, len(known_list), BATCH):
            result.updated += await _apply_label_updates(
                account, await _fetch_many(gmail, known_list[i:i + BATCH], "minimal")
            )
        page_token = page.get("nextPageToken")
        if not page_token:
            break
    return result, start_history


async def incremental_sync(
    gmail: GmailClient, account: ConnectedAccount, settings: UserSettings, history_id: str
) -> tuple[SyncResult, str]:
    result = SyncResult(mode="incremental")
    added: list[str] = []
    label_changed: set[str] = set()
    deleted: set[str] = set()
    page_token: str | None = None
    latest = history_id
    while True:
        page = await gmail.list_history(history_id, page_token)
        latest = str(page.get("historyId", latest))
        for record in page.get("history", []):
            for item in record.get("messagesAdded", []):
                added.append(item["message"]["id"])
            for item in record.get("messagesDeleted", []):
                deleted.add(item["message"]["id"])
            for key in ("labelsAdded", "labelsRemoved"):
                for item in record.get(key, []):
                    label_changed.add(item["message"]["id"])
        page_token = page.get("nextPageToken")
        if not page_token:
            break

    added_unique = [i for i in dict.fromkeys(added) if i not in deleted]
    result.fetched = len(added_unique)
    known = await _existing_ids(account.id, added_unique)
    new_ids = [i for i in added_unique if i not in known]
    for i in range(0, len(new_ids), BATCH):
        await _store_full(account, await _fetch_many(gmail, new_ids[i:i + BATCH], "full"), result,
                          settings.auto_analyze)
    relabel = [i for i in label_changed if i not in deleted and i not in new_ids]
    for i in range(0, len(relabel), BATCH):
        result.updated += await _apply_label_updates(account, await _fetch_many(gmail, relabel[i:i + BATCH], "minimal"))
    if deleted:
        async with system_session() as session:
            res = await session.execute(
                update(EmailMessage)
                .where(EmailMessage.account_id == account.id, EmailMessage.gmail_message_id.in_(list(deleted)))
                .values(is_deleted=True)
            )
            result.deleted = res.rowcount or 0  # type: ignore[attr-defined]
    return result, latest


async def sync_account(account_id: UUID, mode: str = "auto", gmail: GmailClient | None = None) -> SyncResult:
    """Run a sync for one account. ``mode`` is 'auto' (incremental when possible) or 'full'."""
    account, state, settings = await _load_context(account_id)
    owns_client = gmail is None
    if gmail is None:
        from app.gmail.oauth import gmail_client_for

        gmail = await gmail_client_for(account_id)
    try:
        await _sync_labels(gmail, account)
        if mode == "full" or not state.history_id:
            result, new_history = await full_sync(gmail, account, settings)
            full = True
        else:
            try:
                result, new_history = await incremental_sync(gmail, account, settings, state.history_id)
                full = False
            except GmailHistoryExpiredError:
                log.info("gmail_history_expired_resync", account_id=str(account_id))
                result, new_history = await full_sync(gmail, account, settings)
                result.mode = "full_after_history_expired"
                full = True
    except GmailAuthError as exc:
        await _mark_failed(account_id, f"Authorization problem: {exc}", reauth=True)
        raise
    except Exception as exc:
        await _mark_failed(account_id, f"{type(exc).__name__}: {exc}"[:500])
        raise
    finally:
        if owns_client:
            await gmail.aclose()

    now = datetime.now(UTC)
    async with system_session() as session:
        values: dict[str, Any] = {
            "history_id": new_history, "status": "idle", "last_successful_sync_at": now, "last_error": None,
            "messages_synced": SyncState.messages_synced + result.created,
        }
        if full:
            values["last_full_sync_at"] = now
        await session.execute(update(SyncState).where(SyncState.account_id == account_id).values(**values))
        await session.execute(
            update(ConnectedAccount).where(ConnectedAccount.id == account_id).values(last_error=None)
        )
    log.info("gmail_sync_done", account_id=str(account_id), mode=result.mode, created=result.created,
             updated=result.updated, deleted=result.deleted)
    return result


async def _mark_failed(account_id: UUID, error: str, reauth: bool = False) -> None:
    async with system_session() as session:
        await session.execute(
            update(SyncState).where(SyncState.account_id == account_id).values(status="failed", last_error=error)
        )
        if reauth:
            await session.execute(
                update(ConnectedAccount).where(ConnectedAccount.id == account_id)
                .values(status=AccountStatus.needs_reauth, last_error=error)
            )
