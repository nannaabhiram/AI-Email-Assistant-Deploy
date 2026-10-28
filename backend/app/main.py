"""FastAPI application factory."""

from __future__ import annotations

import re
import time
import uuid
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1 import accounts, drafts, emails, health, intelligence, people, tasks
from app.config import get_settings
from app.db.session import dispose_engine
from app.errors import install_error_handlers
from app.llm.service import get_llm_service
from app.logging import configure_logging, get_logger, request_id_var, user_id_var

log = get_logger("api")
_REQUEST_ID_RE = re.compile(r"^[A-Za-z0-9\-_.]{8,64}$")


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    if settings.environment == "production" and settings.log_email_bodies:
        raise RuntimeError("LOG_EMAIL_BODIES must not be enabled in production")
    log.info("api_started", environment=settings.environment, llm_configured=settings.llm_configured,
             gmail_configured=settings.gmail_configured)
    yield
    service = get_llm_service()
    if service.provider is not None:
        await service.provider.aclose()
    await dispose_engine()
    log.info("api_stopped")


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging(settings.log_level, json_output=settings.environment == "production")
    app = FastAPI(
        title="MailPilot AI API",
        version="1.0.0",
        description="Personal AI email agent. Human approval is required for every consequential Gmail action.",
        lifespan=lifespan,
        docs_url="/docs" if settings.environment != "production" else None,
        redoc_url="/redoc" if settings.environment != "production" else None,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE"],
        allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
        expose_headers=["X-Request-ID"],
        max_age=600,
    )

    @app.middleware("http")
    async def context_middleware(request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
        incoming = request.headers.get("x-request-id", "")
        rid = incoming if _REQUEST_ID_RE.match(incoming) else uuid.uuid4().hex
        request_id_var.set(rid)
        user_id_var.set(None)
        start = time.perf_counter()
        response = await call_next(request)
        response.headers["X-Request-ID"] = rid
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Cache-Control"] = "no-store"
        if settings.environment == "production":
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        if request.url.path not in ("/health", "/health/ready"):
            log.info("http_request", method=request.method, path=request.url.path, status=response.status_code,
                     duration_ms=int((time.perf_counter() - start) * 1000))
        return response

    install_error_handlers(app)
    for module in (health, accounts, emails, tasks, drafts, intelligence, people):
        app.include_router(module.router)
    return app


app = create_app()
