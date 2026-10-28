"""Audit trail for sensitive operations. Never store email bodies or secrets here."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import AuditLog
from app.logging import get_logger, request_id_var

log = get_logger(__name__)


def record_audit(
    session: AsyncSession,
    *,
    user_id: UUID | None,
    event: str,
    actor: str = "user",
    entity_type: str | None = None,
    entity_id: Any = None,
    details: dict[str, Any] | None = None,
) -> None:
    session.add(
        AuditLog(
            user_id=user_id,
            actor=actor,
            event=event,
            entity_type=entity_type,
            entity_id=str(entity_id) if entity_id is not None else None,
            details=details or {},
            request_id=request_id_var.get(),
        )
    )
    log.info("audit", audit_event=event, entity_type=entity_type, entity_id=str(entity_id) if entity_id else None)
