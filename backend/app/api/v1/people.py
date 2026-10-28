"""Contacts / VIPs, settings, profile, notifications, jobs, audit history and data deletion."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import httpx
from fastapi import APIRouter, Query
from sqlalchemy import delete, func, or_, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.actions.drafts import validate_addresses
from app.analysis.contacts import refresh_relationship_summary
from app.api.deps import CurrentUserDep, Limit, Offset, SensitiveUserDep
from app.api.schemas import (
    AccountOut,
    AuditOut,
    CommitmentOut,
    ContactCreateIn,
    ContactDetailOut,
    ContactOut,
    ContactPreferenceIn,
    ContactPreferenceOut,
    ContactUpdateIn,
    DeleteAccountIn,
    JobOut,
    NotificationOut,
    Page,
    ProfileOut,
    ProfileUpdateIn,
    SettingsOut,
    SettingsUpdateIn,
)
from app.api.v1.emails import list_item
from app.config import get_settings
from app.db.models import (
    AuditLog,
    Commitment,
    ConnectedAccount,
    Contact,
    ContactPreference,
    EmailAnalysis,
    EmailAttachment,
    EmailMessage,
    EmailThread,
    Job,
    Notification,
    Profile,
    SyncState,
    UserSettings,
)
from app.db.session import system_session, user_session
from app.errors import AppError, ConflictError, NotFoundError, ServiceUnavailableError
from app.gmail.client import SCOPE_MODIFY, SCOPE_SEND
from app.services.audit import record_audit

router = APIRouter(prefix="/api/v1", tags=["people & settings"])


# --- Contacts ----------------------------------------------------------------------------
@router.get("/contacts", response_model=Page[ContactOut])
async def list_contacts(user: CurrentUserDep, limit: Limit = 50, offset: Offset = 0, vip: bool | None = None,
                        q: str | None = Query(default=None, max_length=200),
                        sort: str = Query(default="recent", pattern="^(recent|importance|volume)$")) -> Page[ContactOut]:
    conds = [Contact.user_id == user.id]
    if vip is not None:
        conds.append(Contact.is_vip.is_(vip))
    if q:
        like = f"%{q.lower()}%"
        conds.append(or_(func.lower(Contact.email).like(like), func.lower(func.coalesce(Contact.display_name, "")).like(like)))
    orders: dict[str, list[Any]] = {"recent": [func.greatest(Contact.last_inbound_at, Contact.last_outbound_at).desc().nulls_last()],
             "importance": [Contact.is_vip.desc(), Contact.importance.desc()],
             "volume": [(Contact.inbound_count + Contact.outbound_count).desc()]}
    order = orders[sort]
    async with user_session(user.id) as s:
        total = (await s.execute(select(func.count()).select_from(Contact).where(*conds))).scalar_one()
        rows = (await s.execute(select(Contact).where(*conds).order_by(*order).limit(limit).offset(offset))).scalars().all()
    return Page(items=[ContactOut.model_validate(c) for c in rows], total=total, limit=limit, offset=offset)


@router.post("/contacts", response_model=ContactOut, status_code=201)
async def create_contact(body: ContactCreateIn, user: CurrentUserDep) -> ContactOut:
    email = validate_addresses([body.email], "email")[0]
    async with user_session(user.id) as s:
        stmt = pg_insert(Contact).values(user_id=user.id, email=email, display_name=body.display_name,
                                         domain=email.split("@")[1], is_vip=body.is_vip, importance=body.importance)
        res = await s.execute(stmt.on_conflict_do_nothing().returning(Contact.id))
        if res.scalar_one_or_none() is None:
            raise ConflictError("Contact already exists")
        c = (await s.execute(select(Contact).where(Contact.user_id == user.id, Contact.email == email))).scalar_one()
        return ContactOut.model_validate(c)


@router.get("/contacts/{contact_id}", response_model=ContactDetailOut)
async def get_contact(contact_id: UUID, user: CurrentUserDep) -> ContactDetailOut:
    async with user_session(user.id) as s:
        c = await s.get(Contact, contact_id)
        if c is None:
            raise NotFoundError("Contact not found")
        prefs = await s.get(ContactPreference, contact_id)
        recent = (await s.execute(
            select(EmailMessage, EmailAnalysis).join(EmailAnalysis, EmailAnalysis.message_id == EmailMessage.id, isouter=True)
            .where(EmailMessage.user_id == user.id, EmailMessage.from_address == c.email, EmailMessage.is_deleted.is_(False))
            .order_by(EmailMessage.internal_date.desc()).limit(10)
        )).all()
        commitments = (await s.execute(select(Commitment).where(
            Commitment.user_id == user.id, Commitment.status.in_(["open", "suggested"]),
            Commitment.counterparty.ilike(f"%{c.email}%")))).scalars().all()
    out = ContactDetailOut.model_validate(c)
    out.preferences = ContactPreferenceOut.model_validate(prefs) if prefs else None
    out.recent_messages = [list_item(m, a, c.is_vip) for m, a in recent]
    out.open_commitments = [CommitmentOut.model_validate(x) for x in commitments]
    return out


@router.patch("/contacts/{contact_id}", response_model=ContactOut)
async def update_contact(contact_id: UUID, body: ContactUpdateIn, user: CurrentUserDep) -> ContactOut:
    values = body.model_dump(exclude_none=True)
    if not values:
        raise AppError("No changes supplied", code="no_changes")
    async with user_session(user.id) as s:
        res = await s.execute(update(Contact).where(Contact.id == contact_id).values(**values).returning(Contact.id))
        if res.scalar_one_or_none() is None:
            raise NotFoundError("Contact not found")
        c = (await s.execute(select(Contact).where(Contact.id == contact_id).execution_options(populate_existing=True))).scalar_one()
        return ContactOut.model_validate(c)


@router.put("/contacts/{contact_id}/preferences", response_model=ContactPreferenceOut)
async def set_preferences(contact_id: UUID, body: ContactPreferenceIn, user: CurrentUserDep) -> ContactPreferenceOut:
    order = {"LOW": 0, "MEDIUM": 1, "HIGH": 2}
    if body.priority_floor and body.priority_ceiling and order[body.priority_floor] > order[body.priority_ceiling]:
        raise AppError("Priority floor cannot be above the ceiling", code="invalid_preferences")
    async with user_session(user.id) as s:
        if await s.get(Contact, contact_id) is None:
            raise NotFoundError("Contact not found")
        stmt = pg_insert(ContactPreference).values(contact_id=contact_id, user_id=user.id, **body.model_dump())
        await s.execute(stmt.on_conflict_do_update(index_elements=["contact_id"], set_=body.model_dump()))
        prefs = (await s.execute(select(ContactPreference).where(ContactPreference.contact_id == contact_id)
                                 .execution_options(populate_existing=True))).scalar_one()
        return ContactPreferenceOut.model_validate(prefs)


@router.post("/contacts/{contact_id}/summarize", response_model=ContactOut, summary="Refresh relationship memory")
async def summarize_contact(contact_id: UUID, user: SensitiveUserDep) -> ContactOut:
    return ContactOut.model_validate(await refresh_relationship_summary(user.id, contact_id))


@router.delete("/contacts/{contact_id}/memory", response_model=ContactOut, summary="Delete stored relationship memory")
async def clear_memory(contact_id: UUID, user: CurrentUserDep) -> ContactOut:
    async with user_session(user.id) as s:
        res = await s.execute(update(Contact).where(Contact.id == contact_id)
                              .values(relationship_summary=None, notes=None).returning(Contact.id))
        if res.scalar_one_or_none() is None:
            raise NotFoundError("Contact not found")
        c = (await s.execute(select(Contact).where(Contact.id == contact_id).execution_options(populate_existing=True))).scalar_one()
        return ContactOut.model_validate(c)


# --- Settings / profile ------------------------------------------------------------------
@router.get("/settings", response_model=SettingsOut)
async def get_settings_endpoint(user: CurrentUserDep) -> SettingsOut:
    async with user_session(user.id) as s:
        settings = await s.get(UserSettings, user.id)
    if settings is None:
        raise NotFoundError("Settings not found")
    return SettingsOut.model_validate(settings)


@router.patch("/settings", response_model=SettingsOut)
async def update_settings(body: SettingsUpdateIn, user: CurrentUserDep) -> SettingsOut:
    values: dict[str, Any] = body.model_dump(exclude_none=True, exclude={"version"})
    if "timezone" in values:
        try:
            ZoneInfo(values["timezone"])
        except (ZoneInfoNotFoundError, ValueError) as exc:
            raise AppError("Unknown timezone", code="invalid_timezone") from exc
    if not values:
        raise AppError("No changes supplied", code="no_changes")
    async with user_session(user.id) as s:
        res = await s.execute(update(UserSettings).where(UserSettings.user_id == user.id,
                                                         UserSettings.version == body.version)
                              .values(**values).returning(UserSettings.user_id))
        if res.scalar_one_or_none() is None:
            raise ConflictError("Settings were changed elsewhere; reload and retry", code="version_conflict")
        settings = (await s.execute(select(UserSettings).where(UserSettings.user_id == user.id)
                                    .execution_options(populate_existing=True))).scalar_one()
        out = SettingsOut.model_validate(settings)
    async with system_session() as s:
        record_audit(s, user_id=user.id, event="settings.updated", details={"fields": sorted(values)})
    return out


@router.get("/me", response_model=ProfileOut)
async def me(user: CurrentUserDep) -> ProfileOut:
    async with user_session(user.id) as s:
        profile = await s.get(Profile, user.id)
        settings = await s.get(UserSettings, user.id)
        rows = (await s.execute(select(ConnectedAccount, SyncState)
                                .join(SyncState, SyncState.account_id == ConnectedAccount.id, isouter=True)
                                .where(ConnectedAccount.user_id == user.id))).all()
    if profile is None:
        raise NotFoundError("Profile not found")
    accounts = []
    for a, st in rows:
        out = AccountOut.model_validate(a)
        out.can_send = SCOPE_SEND in a.granted_scopes or SCOPE_MODIFY in a.granted_scopes
        out.can_modify = SCOPE_MODIFY in a.granted_scopes
        from app.api.schemas import SyncStateOut

        out.sync = SyncStateOut.model_validate(st) if st else None
        accounts.append(out)
    return ProfileOut(id=profile.id, email=profile.email, display_name=profile.display_name, accounts=accounts,
                      settings=SettingsOut.model_validate(settings) if settings else None)


@router.patch("/me", response_model=ProfileOut)
async def update_me(body: ProfileUpdateIn, user: CurrentUserDep) -> ProfileOut:
    async with user_session(user.id) as s:
        await s.execute(update(Profile).where(Profile.id == user.id).values(display_name=body.display_name.strip()))
    return await me(user)


@router.delete("/me", status_code=204, summary="Delete account and all data")
async def delete_me(body: DeleteAccountIn, user: SensitiveUserDep) -> None:
    from app.gmail.oauth import revoke_and_disconnect

    async with system_session() as s:
        account_ids = (await s.execute(select(ConnectedAccount.id).where(ConnectedAccount.user_id == user.id))).scalars().all()
        paths = (await s.execute(select(EmailAttachment.storage_path).where(
            EmailAttachment.user_id == user.id, EmailAttachment.storage_path.is_not(None)))).scalars().all()
    for account_id in account_ids:
        await revoke_and_disconnect(user.id, account_id, delete_data=True)
    if paths:
        from app.services.storage import delete_objects

        await delete_objects([p for p in paths if p])
    settings = get_settings()
    key = settings.supabase_service_role_key.get_secret_value()
    if not key:
        raise ServiceUnavailableError("Account deletion requires the service role key on the server")
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.delete(f"{settings.supabase_url.rstrip('/')}/auth/v1/admin/users/{user.id}",
                                   headers={"Authorization": f"Bearer {key}", "apikey": key})
    if resp.status_code >= 300:
        raise ServiceUnavailableError("Could not delete the authentication user; data was removed, retry later")


@router.delete("/data/emails", status_code=204, summary="Delete all synced email data (keeps accounts)")
async def delete_email_data(user: SensitiveUserDep) -> None:
    async with system_session() as s:
        paths = (await s.execute(select(EmailAttachment.storage_path).where(
            EmailAttachment.user_id == user.id, EmailAttachment.storage_path.is_not(None)))).scalars().all()
        await s.execute(delete(EmailThread).where(EmailThread.user_id == user.id))
        await s.execute(update(SyncState).where(SyncState.user_id == user.id)
                        .values(history_id=None, messages_synced=0, last_full_sync_at=None))
        record_audit(s, user_id=user.id, event="data.emails_deleted")
    if paths:
        from app.services.storage import delete_objects

        await delete_objects([p for p in paths if p])


# --- Notifications / jobs / audit ----------------------------------------------------------
@router.get("/notifications", response_model=Page[NotificationOut])
async def list_notifications(user: CurrentUserDep, limit: Limit = 30, offset: Offset = 0,
                             unread_only: bool = False) -> Page[NotificationOut]:
    conds = [Notification.user_id == user.id]
    if unread_only:
        conds.append(Notification.read_at.is_(None))
    async with user_session(user.id) as s:
        total = (await s.execute(select(func.count()).select_from(Notification).where(*conds))).scalar_one()
        rows = (await s.execute(select(Notification).where(*conds).order_by(Notification.created_at.desc())
                                .limit(limit).offset(offset))).scalars().all()
    return Page(items=[NotificationOut.model_validate(n) for n in rows], total=total, limit=limit, offset=offset)


@router.post("/notifications/read-all", status_code=204)
async def read_all(user: CurrentUserDep) -> None:
    async with user_session(user.id) as s:
        await s.execute(update(Notification).where(Notification.user_id == user.id, Notification.read_at.is_(None))
                        .values(read_at=datetime.now(UTC)))


@router.post("/notifications/{notification_id}/read", status_code=204)
async def read_one(notification_id: UUID, user: CurrentUserDep) -> None:
    async with user_session(user.id) as s:
        await s.execute(update(Notification).where(Notification.id == notification_id).values(read_at=datetime.now(UTC)))


@router.get("/jobs", response_model=list[JobOut])
async def list_jobs(user: CurrentUserDep, limit: Limit = 30, failed_only: bool = False) -> list[JobOut]:
    async with user_session(user.id) as s:
        q = select(Job).where(Job.user_id == user.id)
        if failed_only:
            q = q.where(Job.status.in_(["failed", "dead"]))
        rows = (await s.execute(q.order_by(Job.created_at.desc()).limit(limit))).scalars().all()
    return [JobOut.model_validate(j) for j in rows]


@router.get("/jobs/{job_id}", response_model=JobOut)
async def get_job(job_id: int, user: CurrentUserDep) -> JobOut:
    async with user_session(user.id) as s:
        job = await s.get(Job, job_id)
    if job is None:
        raise NotFoundError("Job not found")
    return JobOut.model_validate(job)


@router.get("/audit", response_model=Page[AuditOut])
async def audit_history(user: CurrentUserDep, limit: Limit = 50, offset: Offset = 0,
                        event: str | None = Query(default=None, max_length=100)) -> Page[AuditOut]:
    conds = [AuditLog.user_id == user.id]
    if event:
        conds.append(AuditLog.event.like(f"{event}%"))
    async with user_session(user.id) as s:
        total = (await s.execute(select(func.count()).select_from(AuditLog).where(*conds))).scalar_one()
        rows = (await s.execute(select(AuditLog).where(*conds).order_by(AuditLog.created_at.desc())
                                .limit(limit).offset(offset))).scalars().all()
    return Page(items=[AuditOut.model_validate(r) for r in rows], total=total, limit=limit, offset=offset)
