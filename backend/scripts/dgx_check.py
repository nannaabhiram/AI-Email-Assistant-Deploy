"""DGX Spark inference diagnostics.

Usage (from backend/, with .env configured and the SSH tunnel running if used):
    .venv\\Scripts\\python.exe scripts\\dgx_check.py

Checks, in order: configuration, TCP reachability of the endpoint, GET /models (and
whether DGX_LLM_MODEL is served), a tiny chat completion, and structured JSON output in
the configured mode. Prints no secrets and sends no email data (synthetic prompt only).
"""

from __future__ import annotations

import asyncio
import json
import socket
import sys
import time
from pathlib import Path
from urllib.parse import urlparse

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pydantic import BaseModel  # noqa: E402

from app.config import get_settings  # noqa: E402
from app.llm.base import LLMError  # noqa: E402
from app.llm.openai_compat import OpenAICompatibleProvider  # noqa: E402
from app.llm.service import LLMService  # noqa: E402


class Probe(BaseModel):
    ok: bool
    color: str


def line(status: str, msg: str) -> None:
    print(f"[{status:^7}] {msg}")


async def main() -> int:
    s = get_settings()
    if not s.llm_configured:
        line("BLOCKED", "DGX_LLM_API_BASE_URL and DGX_LLM_MODEL must be set in backend/.env")
        return 2
    url = urlparse(s.dgx_llm_api_base_url)
    host, port = url.hostname or "", url.port or (443 if url.scheme == "https" else 80)
    line("INFO", f"endpoint {url.scheme}://{host}:{port}{url.path}  model={s.dgx_llm_model}  "
                 f"structured_output={s.dgx_llm_structured_output}")
    if s.dgx_ssh_host:
        line("INFO", f"configured for SSH tunnel to {s.dgx_ssh_user or '?'}@{s.dgx_ssh_host}:{s.dgx_ssh_port} "
                     f"-> {s.dgx_remote_llm_host}:{s.dgx_remote_llm_port}")
    try:
        with socket.create_connection((host, port), timeout=5):
            line("PASS", f"TCP connection to {host}:{port}")
    except OSError as exc:
        line("FAIL", f"cannot open TCP connection to {host}:{port} ({exc}). Is the SSH tunnel running?")
        return 1

    provider = OpenAICompatibleProvider(s)
    report = await provider.health()
    if not report.reachable:
        line("FAIL", f"/models failed: {report.error}")
        return 1
    line("PASS", f"/models answered in {report.latency_ms} ms; served: {', '.join(report.available_models[:10]) or 'none'}")
    if not report.model_available:
        line("FAIL", f"configured model '{s.dgx_llm_model}' is not served by this endpoint")
        return 1
    line("PASS", "configured model is served")

    service = LLMService(provider, s, record_metrics=False)
    start = time.perf_counter()
    try:
        out, meta = await service.generate(
            task="dgx_probe", system_prompt="Return JSON only.", untrusted={"data": "The sky in this test is blue."},
            trusted_context="Set ok=true and color to the colour mentioned in the data.", output_model=Probe,
            max_tokens=60,
        )
    except LLMError as exc:
        line("FAIL", f"structured completion failed: {exc.code}: {exc}")
        if s.dgx_llm_structured_output == "json_schema":
            line("HINT", "if the server does not support response_format=json_schema, set "
                         "DGX_LLM_STRUCTURED_OUTPUT=json_object or prompt")
        return 1
    line("PASS", f"structured completion valid in {int((time.perf_counter() - start) * 1000)} ms "
                 f"(attempts={meta.attempts}): {json.dumps(out.model_dump())}")
    await provider.aclose()
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
