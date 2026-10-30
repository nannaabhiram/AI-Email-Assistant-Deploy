"""MailPilot targets exactly one DGX (Spark 2). Other hosts, including Spark 1 and cloud APIs, are refused."""

from pathlib import Path

import httpx
import pytest
from pydantic import SecretStr

from app.config import Settings, get_settings
from app.llm.base import LLMNotConfiguredError, LLMUnavailableError
from app.llm.openai_compat import OpenAICompatibleProvider
from app.llm.schemas import SearchQueryOutput
from app.llm.service import LLMService

SPARK2 = "100.80.191.86"
SPARK1 = "100.122.104.3"  # retired: must never be contacted
BACKEND = Path(__file__).resolve().parents[2]


def spark2(url: str, **extra: object) -> Settings:
    return get_settings().model_copy(update={
        "dgx_ssh_host": SPARK2, "dgx_ssh_user": "klh", "dgx_llm_api_base_url": url,
        "dgx_llm_model": "served-model", "llm_max_retries": 1, **extra,
    })


@pytest.mark.parametrize("url", ["http://127.0.0.1:18000/v1", "http://localhost:18000/v1",
                                 f"http://{SPARK2}:8000/v1"])
def test_tunnel_or_spark2_endpoints_are_accepted(url: str) -> None:
    s = spark2(url)
    assert s.llm_endpoint_problem is None and s.llm_configured


@pytest.mark.parametrize("url", [f"http://{SPARK1}:8000/v1", "https://api.openai.com/v1",
                                 "https://api.anthropic.com/v1", "https://generativelanguage.googleapis.com/v1",
                                 "ftp://127.0.0.1/v1"])
def test_other_hosts_and_cloud_apis_are_refused(url: str) -> None:
    s = spark2(url)
    assert s.llm_endpoint_problem is not None and not s.llm_configured
    with pytest.raises(LLMNotConfiguredError):
        OpenAICompatibleProvider(s)


async def test_refused_endpoint_is_reported_in_health_and_never_called() -> None:
    s = spark2("https://api.openai.com/v1")
    service = LLMService(None, s, record_metrics=False)
    report = await service.health()
    assert not report.reachable and report.error is not None and "refusing to send email content" in report.error
    with pytest.raises(LLMNotConfiguredError):
        await service.generate(task="t", system_prompt="s", untrusted={"email": "x"}, trusted_context="",
                               output_model=SearchQueryOutput)


TUNNEL = "spark2-llm.trycloudflare.com"


def test_dgx_tunnel_host_needs_https_and_api_key() -> None:
    ok = spark2(f"https://{TUNNEL}/v1", dgx_tunnel_host=TUNNEL, dgx_llm_api_key=SecretStr("k"))
    assert ok.llm_endpoint_problem is None and ok.llm_configured
    no_key = spark2(f"https://{TUNNEL}/v1", dgx_tunnel_host=TUNNEL)
    assert no_key.llm_endpoint_problem is not None and not no_key.llm_configured
    plain = spark2(f"http://{TUNNEL}/v1", dgx_tunnel_host=TUNNEL, dgx_llm_api_key=SecretStr("k"))
    assert plain.llm_endpoint_problem is not None
    other = spark2("https://api.openai.com/v1", dgx_tunnel_host=TUNNEL, dgx_llm_api_key=SecretStr("k"))
    assert other.llm_endpoint_problem is not None


def _recording(handler: httpx.MockTransport) -> tuple[httpx.AsyncClient, list[str]]:
    hosts: list[str] = []

    async def record(request: httpx.Request) -> httpx.Response:
        hosts.append(request.url.host)
        return await handler.handle_async_request(request)

    return httpx.AsyncClient(transport=httpx.MockTransport(record)), hosts


async def test_spark2_offline_gives_clear_diagnostic_without_trying_any_other_host() -> None:
    def offline(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("connection refused", request=request)

    http, hosts = _recording(httpx.MockTransport(offline))
    s = spark2("http://127.0.0.1:18000/v1")
    provider = OpenAICompatibleProvider(s, http=http)
    report = await provider.health()
    assert not report.reachable and report.error == "ConnectError: cannot reach endpoint"

    service = LLMService(provider, s, record_metrics=False)
    with pytest.raises(LLMUnavailableError):  # the pipeline turns this into a labelled rule-based result
        await service.generate(task="t", system_prompt="s", untrusted={"email": "x"}, trusted_context="",
                               output_model=SearchQueryOutput)
    assert hosts and set(hosts) == {"127.0.0.1"}  # retries stay on the tunnel; no failover host
    await provider.aclose()


async def test_direct_spark2_endpoint_only_contacts_spark2() -> None:
    def ok(_: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"data": [{"id": "served-model"}]})

    http, hosts = _recording(httpx.MockTransport(ok))
    provider = OpenAICompatibleProvider(spark2(f"http://{SPARK2}:8000/v1"), http=http)
    report = await provider.health()
    assert report.reachable and report.model_available and hosts == [SPARK2]
    await provider.aclose()


def test_project_configuration_never_names_spark1() -> None:
    files = [BACKEND / ".env.example", *(BACKEND / "app").rglob("*.py"), *(BACKEND / "scripts").glob("*.py"),
             BACKEND.parent / "scripts" / "dgx-tunnel.ps1"]
    offenders = [str(f) for f in files if f.is_file() and SPARK1 in f.read_text(encoding="utf-8", errors="ignore")]
    assert offenders == []
    local = BACKEND / ".env"  # developer machine only; absent in CI
    if local.is_file():
        values = dict(line.split("=", 1) for line in local.read_text(encoding="utf-8").splitlines()
                      if "=" in line and not line.lstrip().startswith("#"))
        assert SPARK1 not in values.get("DGX_SSH_HOST", "") and SPARK1 not in values.get("DGX_LLM_API_BASE_URL", "")
