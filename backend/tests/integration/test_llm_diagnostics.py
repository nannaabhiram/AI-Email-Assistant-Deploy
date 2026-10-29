"""Inference diagnostics: settings source, and the four states the UI shows (regression for a stale
API process that reported "LLM endpoint not configured" although backend/.env configured Spark 2)."""

import json
import uuid
from collections.abc import Callable, Iterator
from pathlib import Path

import httpx
import pytest
from pydantic import BaseModel

from app.config import ENV_FILE, Settings, get_settings
from app.llm.openai_compat import OpenAICompatibleProvider
from app.llm.service import LLMService, set_llm_service
from tests.conftest import make_token

BASE_URL = "http://127.0.0.1:18000/v1"
MODEL = "qwen2.5vl:7b"
DGX = {"dgx_ssh_host": "100.80.191.86", "dgx_ssh_user": "klh", "dgx_llm_api_base_url": BASE_URL,
       "dgx_llm_model": MODEL, "dgx_llm_structured_output": "json_schema"}


def test_settings_always_read_backend_env_regardless_of_working_directory(tmp_path: Path,
                                                                         monkeypatch: pytest.MonkeyPatch) -> None:
    assert ENV_FILE == Path(__file__).resolve().parents[2] / ".env"
    assert Settings.model_config["env_file"] == ENV_FILE
    env = tmp_path / ".env"
    env.write_text(f"DGX_LLM_API_BASE_URL={BASE_URL}\nDGX_LLM_MODEL={MODEL}\nDGX_SSH_HOST=100.80.191.86\n")
    for key in ("DGX_LLM_API_BASE_URL", "DGX_LLM_MODEL", "DGX_SSH_HOST"):
        monkeypatch.delenv(key, raising=False)
    monkeypatch.chdir(tmp_path.parent)  # a different working directory must not matter
    s = Settings(_env_file=env)  # type: ignore[call-arg]
    assert (s.dgx_llm_api_base_url, s.dgx_llm_model, s.llm_configured) == (BASE_URL, MODEL, True)


@pytest.fixture
def dgx(monkeypatch: pytest.MonkeyPatch) -> Iterator[Callable[[Callable[[httpx.Request], httpx.Response] | None], None]]:
    """Point the running app at a (mocked) Spark 2 tunnel; None leaves inference unconfigured."""
    settings = get_settings()

    def use(handler: Callable[[httpx.Request], httpx.Response] | None) -> None:
        if handler is None:
            set_llm_service(LLMService(None, settings, record_metrics=False))
            return
        for key, value in DGX.items():
            monkeypatch.setattr(settings, key, value)
        http = httpx.AsyncClient(transport=httpx.MockTransport(handler))
        set_llm_service(LLMService(OpenAICompatibleProvider(settings, http=http), settings, record_metrics=False))

    yield use
    set_llm_service(None)


def _models(*ids: str) -> Callable[[httpx.Request], httpx.Response]:
    return lambda _: httpx.Response(200, json={"data": [{"id": i} for i in ids]})


def _offline(request: httpx.Request) -> httpx.Response:
    raise httpx.ConnectError("connection refused", request=request)


async def _diag(client, user: uuid.UUID) -> tuple[dict, dict]:  # type: ignore[no-untyped-def,type-arg]
    h = {"Authorization": f"Bearer {make_token(user)}"}
    diag = (await client.get("/api/v1/diagnostics/llm", headers=h)).json()
    status = (await client.get("/api/v1/system/status", headers=h)).json()["llm"]
    return diag, status


async def test_available_when_spark2_serves_the_model(client, user_a: uuid.UUID, dgx) -> None:  # type: ignore[no-untyped-def]
    dgx(_models("qwen3.6:27b", MODEL, "gemma4:26b"))
    diag, status = await _diag(client, user_a)
    assert diag["state"] == status["state"] == "available"
    assert diag["configured"] and diag["reachable"] and diag["model_available"] and diag["error"] is None
    assert diag["configured_model"] == status["model"] == MODEL
    assert diag["endpoint_host"] == "127.0.0.1:18000" and diag["via_ssh_tunnel"] is True
    assert diag["structured_output_mode"] == "json_schema" and diag["latency_ms"] is not None


async def test_unreachable_tunnel_is_not_reported_as_unconfigured(client, user_a: uuid.UUID, dgx) -> None:  # type: ignore[no-untyped-def]
    dgx(_offline)
    diag, status = await _diag(client, user_a)
    assert diag["state"] == status["state"] == "unreachable"
    assert diag["configured"] is True and diag["configured_model"] == MODEL
    assert diag["error"] == "ConnectError: cannot reach endpoint"


async def test_model_missing_when_spark2_does_not_serve_it(client, user_a: uuid.UUID, dgx) -> None:  # type: ignore[no-untyped-def]
    dgx(_models("gemma4:26b"))
    diag, _ = await _diag(client, user_a)
    assert diag["state"] == "model_missing" and diag["available_models"] == ["gemma4:26b"]


async def test_not_configured_only_when_endpoint_is_missing(client, user_a: uuid.UUID, dgx) -> None:  # type: ignore[no-untyped-def]
    dgx(None)
    diag, status = await _diag(client, user_a)
    assert diag["state"] == status["state"] == "not_configured"
    assert diag["configured"] is False and diag["error"] == "LLM endpoint not configured"


class Probe(BaseModel):
    ok: bool
    color: str


async def test_structured_json_through_the_real_inference_client() -> None:
    seen: list[dict] = []  # type: ignore[type-arg]

    def ollama(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        seen.append(body)
        assert request.url == httpx.URL(f"{BASE_URL}/chat/completions")
        return httpx.Response(200, json={"model": MODEL, "choices": [
            {"message": {"content": '{"ok": true, "color": "blue"}'}, "finish_reason": "stop"}]})

    settings = get_settings().model_copy(update=DGX)
    provider = OpenAICompatibleProvider(settings, http=httpx.AsyncClient(transport=httpx.MockTransport(ollama)))
    out, meta = await LLMService(provider, settings, record_metrics=False).generate(
        task="probe", system_prompt="Return JSON only.", untrusted={"data": "The sky is blue."},
        trusted_context="Set ok=true and color to the colour mentioned.", output_model=Probe)
    assert out == Probe(ok=True, color="blue") and meta.model == MODEL
    assert seen[0]["model"] == MODEL and seen[0]["response_format"]["type"] == "json_schema"
