"""Health, readiness and diagnostics. Responses never include secrets or email content."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from urllib.parse import urlparse

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from sqlalchemy import func, select

from app.api.deps import CurrentUserDep
from app.config import get_settings
from app.db.models import ConnectedAccount, Job, LLMCall, SyncState
from app.db.session import check_database, user_session
from app.llm.service import get_llm_service

router = APIRouter(tags=["health"])


@router.get("/health", summary="Liveness probe")
async def health() -> dict[str, str]:
    return {"status": "ok", "time": datetime.now(UTC).isoformat()}


@router.get("/health/ready", summary="Readiness probe (database)")
async def ready() -> JSONResponse:
    try:
        await check_database()
        return JSONResponse({"status": "ready", "database": "ok"})
    except Exception as exc:
        return JSONResponse({"status": "not_ready", "database": type(exc).__name__}, status_code=503)


@router.get("/api/v1/diagnostics/llm", summary="Remote DGX inference diagnostics")
async def llm_diagnostics(_: CurrentUserDep) -> dict[str, Any]:
    settings = get_settings()
    report = await get_llm_service().health()
    endpoint = urlparse(settings.dgx_llm_api_base_url) if settings.dgx_llm_api_base_url else None
    return {
        "configured": settings.llm_configured,
        "reachable": report.reachable,
        "latency_ms": report.latency_ms,
        "configured_model": report.configured_model or None,
        "model_available": report.model_available,
        "available_models": report.available_models[:20],
        "error": report.error,
        "endpoint_host": f"{endpoint.hostname}:{endpoint.port}" if endpoint else None,
        "via_ssh_tunnel": bool(settings.dgx_ssh_host),
        "structured_output_mode": settings.dgx_llm_structured_output,
        "max_concurrency": settings.llm_max_concurrency,
        "timeout_seconds": settings.llm_request_timeout,
        "fallback_mode": settings.llm_fallback_mode,
        "embeddings_configured": settings.embeddings_configured,
    }


@router.get("/api/v1/system/status", summary="Dashboard status: sync, jobs, inference")
async def system_status(user: CurrentUserDep) -> dict[str, Any]:
    async with user_session(user.id) as s:
        accounts = (await s.execute(
            select(ConnectedAccount.id, ConnectedAccount.email_address, ConnectedAccount.status,
                   SyncState.status, SyncState.last_successful_sync_at, SyncState.last_error)
            .join(SyncState, SyncState.account_id == ConnectedAccount.id, isouter=True)
        )).all()
        jobs = dict((await s.execute(
            select(Job.status, func.count()).where(Job.user_id == user.id).group_by(Job.status)
        )).all())
        failed_recent = (await s.execute(
            select(Job.job_type, Job.last_error, Job.updated_at)
            .where(Job.user_id == user.id, Job.status.in_(["dead", "failed"]))
            .order_by(Job.updated_at.desc()).limit(5)
        )).all()
        llm_window = (await s.execute(
            select(LLMCall.status, func.count(), func.avg(LLMCall.latency_ms))
            .where(LLMCall.user_id == user.id, LLMCall.created_at > func.now() - func.make_interval(0, 0, 0, 1))
            .group_by(LLMCall.status)
        )).all()
    report = await get_llm_service().health()
    return {
        "accounts": [
            {"id": str(a[0]), "email": a[1], "status": a[2], "sync_status": a[3],
             "last_successful_sync_at": a[4], "last_error": a[5]} for a in accounts
        ],
        "jobs": {str(k.value if hasattr(k, "value") else k): v for k, v in jobs.items()},
        "recent_job_failures": [{"job_type": f[0], "error": (f[1] or "")[:300], "at": f[2]} for f in failed_recent],
        "llm": {
            "configured": get_settings().llm_configured,
            "reachable": report.reachable,
            "model": report.configured_model or None,
            "model_available": report.model_available,
            "latency_ms": report.latency_ms,
            "error": report.error,
            "last_24h": {row[0]: {"count": row[1], "avg_latency_ms": int(row[2] or 0)} for row in llm_window},
        },
    }
