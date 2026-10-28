"""Supabase Storage access (private bucket, service-role only, short-lived signed URLs)."""

from __future__ import annotations

import re
from urllib.parse import quote

import httpx

from app.config import get_settings
from app.errors import NotConfiguredError, ServiceUnavailableError


def _headers() -> dict[str, str]:
    key = get_settings().supabase_service_role_key.get_secret_value()
    if not key:
        raise NotConfiguredError("SUPABASE_SERVICE_ROLE_KEY is not configured", code="storage_not_configured")
    return {"Authorization": f"Bearer {key}", "apikey": key}


def safe_object_name(filename: str) -> str:
    name = re.sub(r"[^\w.\-]+", "_", filename)[:120].strip("._") or "attachment"
    return name


async def upload_object(path: str, data: bytes, content_type: str) -> None:
    settings = get_settings()
    url = f"{settings.supabase_url.rstrip('/')}/storage/v1/object/{settings.attachments_bucket}/{quote(path)}"
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(url, content=data, headers={**_headers(), "Content-Type": content_type,
                                                              "x-upsert": "true"})
    if resp.status_code >= 300:
        raise ServiceUnavailableError(f"Storage upload failed (HTTP {resp.status_code})", code="storage_error")


async def signed_url(path: str) -> str:
    settings = get_settings()
    base = settings.supabase_url.rstrip("/")
    url = f"{base}/storage/v1/object/sign/{settings.attachments_bucket}/{quote(path)}"
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(url, json={"expiresIn": settings.signed_url_ttl_seconds}, headers=_headers())
    if resp.status_code >= 300:
        raise ServiceUnavailableError("Could not create a signed URL", code="storage_error")
    signed = resp.json().get("signedURL") or resp.json().get("signedUrl")
    return f"{base}/storage/v1{signed}" if signed and signed.startswith("/") else str(signed)


async def delete_objects(paths: list[str]) -> None:
    if not paths:
        return
    settings = get_settings()
    url = f"{settings.supabase_url.rstrip('/')}/storage/v1/object/{settings.attachments_bucket}"
    async with httpx.AsyncClient(timeout=30.0) as client:
        await client.request("DELETE", url, json={"prefixes": paths}, headers=_headers())
