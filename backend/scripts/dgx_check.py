"""DGX Spark inference diagnostics.

Usage (from backend/, with .env configured and the SSH tunnel running if used):
    .venv\\Scripts\\python.exe scripts\\dgx_check.py

Checks, in order: SSH access to DGX_SSH_HOST (key present, public-key fingerprint, non-interactive
login), endpoint configuration, TCP reachability of the endpoint, GET /models (and
whether DGX_LLM_MODEL is served), a tiny chat completion, and structured JSON output in
the configured mode. Prints no secrets and sends no email data (synthetic prompt only).
"""

from __future__ import annotations

import asyncio
import json
import os
import shutil
import socket
import subprocess
import sys
import time
from pathlib import Path
from urllib.parse import urlparse

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pydantic import BaseModel  # noqa: E402

from app.config import Settings, get_settings  # noqa: E402
from app.llm.base import LLMError  # noqa: E402
from app.llm.openai_compat import OpenAICompatibleProvider  # noqa: E402
from app.llm.service import LLMService  # noqa: E402


class Probe(BaseModel):
    ok: bool
    color: str


def line(status: str, msg: str) -> None:
    print(f"[{status:^7}] {msg}")


def check_ssh(s: Settings) -> bool:
    """Key present + key-only, non-interactive login. Prints the public fingerprint, never key material."""
    if not s.dgx_ssh_host:
        line("INFO", "DGX_SSH_HOST not set; skipping SSH checks (direct private-network endpoint)")
        return True
    key = Path(os.path.expandvars(os.path.expanduser(s.dgx_ssh_key_path))) if s.dgx_ssh_key_path else None
    if key is not None:
        if not key.is_file():
            line("FAIL", f"DGX_SSH_KEY_PATH does not exist: {key}")
            return False
        pub = key.with_name(key.name + ".pub")
        keygen = shutil.which("ssh-keygen")
        if pub.is_file() and keygen:
            # Argument list from local config, no shell: nothing is interpolated into a command line.
            fp = subprocess.run([keygen, "-lf", str(pub)], capture_output=True, text=True, timeout=10)  # noqa: S603
            line("INFO", f"key {key.name}: {fp.stdout.strip() or 'fingerprint unavailable'}")
            line("INFO", f"the DGX must list {pub} in ~{s.dgx_ssh_user}/.ssh/authorized_keys")
    ssh = shutil.which("ssh")
    if not ssh:
        line("FAIL", "OpenSSH client not found on PATH")
        return False
    cmd = [ssh, "-o", "BatchMode=yes", "-o", "ConnectTimeout=8", "-o", "PasswordAuthentication=no",
           "-p", str(s.dgx_ssh_port)]
    if key is not None:
        cmd += ["-i", str(key), "-o", "IdentitiesOnly=yes"]
    cmd += [f"{s.dgx_ssh_user}@{s.dgx_ssh_host}" if s.dgx_ssh_user else s.dgx_ssh_host, "true"]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=20)  # noqa: S603
    except subprocess.TimeoutExpired:
        line("BLOCKED", f"SSH to {s.dgx_ssh_host} timed out (host offline or not on Tailscale?)")
        return False
    if result.returncode == 0:
        line("PASS", f"SSH key login to {s.dgx_ssh_user}@{s.dgx_ssh_host}:{s.dgx_ssh_port}")
        return True
    err = result.stderr.strip().splitlines()[-1] if result.stderr.strip() else f"exit {result.returncode}"
    line("BLOCKED", f"SSH to {s.dgx_ssh_host}: {err}")
    if "Permission denied" in err:
        line("HINT", "the host is reachable but does not accept this key: authorize the .pub file above")
    return False


async def main() -> int:
    s = get_settings()
    ssh_ok = check_ssh(s)
    if s.llm_endpoint_problem:
        line("FAIL", s.llm_endpoint_problem)
        return 2
    if not s.llm_configured:
        line("BLOCKED", "DGX_LLM_API_BASE_URL and DGX_LLM_MODEL must be set in backend/.env"
                        + ("" if ssh_ok else " (fix SSH access first, then read them from the DGX)"))
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
