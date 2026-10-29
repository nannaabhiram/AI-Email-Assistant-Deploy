# DGX Spark remote inference

All LLM work (classification, summaries, extraction, drafting, search parsing, briefing narrative, relationship memory, attachment analysis) is sent **only** to `DGX_LLM_API_BASE_URL`. There is no cloud fallback. If the DGX is unreachable:

- New emails get a deterministic **rule-based** analysis. It is stored with `source = 'rules'`, shown as "Rule-based (AI unavailable)", and the LLM analysis job is deferred and retried every 5 minutes without using up its retry budget (`LLM_FALLBACK_MODE=rules`). With `LLM_FALLBACK_MODE=queue`, analysis just waits.
- Thread summaries fall back to a labelled extractive summary.
- AI drafting, contact memory and AI search parsing report "unavailable". Search falls back to a keyword parser.

**Target host: `spark2` only** (`klh@100.80.191.86`, Tailscale name `spark-66ae`). `spark1` is not used. There is no secondary host, no failover and no cloud model.

This is enforced in code, not just configuration. `DGX_LLM_API_BASE_URL` must point at a loopback address (the SSH tunnel to `spark2`) or at `DGX_SSH_HOST` itself. Any other host, including `spark1` or a cloud API, is refused at startup: inference stays disabled, and the diagnostics show the reason (`Settings.llm_endpoint_problem`, tested in `tests/unit/test_dgx_target.py`). While `spark2` is unavailable, every email gets the labelled rule-based analysis described above.

## What was verified on this machine (2026-10-29)

| Check | Result |
|---|---|
| `backend/.env` | `DGX_SSH_HOST=100.80.191.86`, `DGX_SSH_USER=klh`, `DGX_SSH_PORT=22`, `DGX_SSH_KEY_PATH=C:\Users\nanna\.ssh\id_ed25519`. Model URL and name are not set yet |
| Local key | `C:\Users\nanna\.ssh\id_ed25519` exists. Public key fingerprint `SHA256:q4THU/Fcz/Z3Kl7K9Qv1MRxRRjfZ5B5beGXeq2YC4HE` (ED25519, comment `ocr-eval-abhiram`) |
| Tailscale status | `spark-66ae` (100.80.191.86) **online** |
| `ssh -i …id_ed25519 -o IdentitiesOnly=yes klh@100.80.191.86` | **Blocked**: `Permission denied (publickey,password)`. The host is up and answering SSH, but `~klh/.ssh/authorized_keys` on spark2 does not contain the key above |
| Direct HTTP `GET /v1/models` on spark2 (ports 8000, 8001, 8080, 11434, 30000, 5000, 9000, 8888, 3000) | No response on any port. Consistent with an inference server bound to localhost on the DGX (the recommended setup) or no server running |

**I could not determine which inference server or model is installed, so no DGX values are configured, and the DGX contract tests are reported as BLOCKED, not passed.** Unblock it as follows.

## 1. Authorize your SSH key on the DGX

From a machine that already has access (or the DGX console), append this machine's public key:

```powershell
Get-Content $env:USERPROFILE\.ssh\id_ed25519.pub   # copy the output
```

```bash
# on spark2, as klh
mkdir -p ~/.ssh && chmod 700 ~/.ssh
echo "<paste public key>" >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys
```

Only the **public** key (`id_ed25519.pub`, one line starting `ssh-ed25519`) is copied. Never copy `id_ed25519` itself. If you can still log in to spark2 with a password from somewhere, this one command does the same from Windows:

```powershell
Get-Content $env:USERPROFILE\.ssh\id_ed25519.pub | ssh klh@100.80.191.86 "umask 077; mkdir -p ~/.ssh; cat >> ~/.ssh/authorized_keys"
```

After it's added, confirm the fingerprint on spark2 matches `SHA256:q4THU/Fcz/Z3Kl7K9Qv1MRxRRjfZ5B5beGXeq2YC4HE` with `ssh-keygen -lf ~/.ssh/authorized_keys`, then test from Windows:

```powershell
ssh -o BatchMode=yes -o IdentitiesOnly=yes -i $env:USERPROFILE\.ssh\id_ed25519 klh@100.80.191.86 hostname
```

Leave `PasswordAuthentication` alone (or set it to `no`). Key login is all MailPilot needs.

## 2. Identify the inference server

```bash
ssh klh@100.80.191.86 'ss -ltnp | grep LISTEN; docker ps --format "{{.Names}} {{.Image}} {{.Ports}}"; nvidia-smi'
ssh klh@100.80.191.86 'curl -s http://127.0.0.1:<port>/v1/models'
```

MailPilot needs an **OpenAI-compatible** `/v1/chat/completions` + `/v1/models` endpoint. vLLM, SGLang, TensorRT-LLM (trtllm-serve), NVIDIA NIM, llama.cpp `llama-server`, and Ollama's `/v1` endpoint all qualify. If nothing is running, an example vLLM launch bound to localhost is:

```bash
# on the DGX; pick a model that fits the GB10 memory and your licence requirements
docker run --gpus all --rm -p 127.0.0.1:8000:8000 --ipc=host \
  -v ~/.cache/huggingface:/root/.cache/huggingface \
  <vllm-image-for-your-dgx-os> vllm serve <model-id> --max-model-len 16384
```

Keep the port bound to `127.0.0.1` so the model is not exposed on the network.

## 3. Open the SSH tunnel (this machine)

Edit `backend/.env`:

```ini
DGX_SSH_HOST=100.80.191.86           # spark2; spark1 is not used
DGX_SSH_USER=klh
DGX_SSH_PORT=22
DGX_SSH_KEY_PATH=C:\Users\<you>\.ssh\id_ed25519
DGX_REMOTE_LLM_HOST=127.0.0.1
DGX_REMOTE_LLM_PORT=<port found in step 2, e.g. 8000>
DGX_LOCAL_TUNNEL_PORT=18000
DGX_LLM_API_BASE_URL=http://127.0.0.1:18000/v1
DGX_LLM_MODEL=<exact id from /v1/models>
DGX_LLM_API_KEY=                     # only if the server requires one
DGX_LLM_STRUCTURED_OUTPUT=json_schema   # json_object or prompt if unsupported
LLM_REQUEST_TIMEOUT=90
LLM_MAX_CONCURRENCY=4
```

Start the tunnel. It reconnects automatically if it drops:

```powershell
.\scripts\dgx-tunnel.ps1
# equivalent to:
ssh -N -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -p 22 -i $env:USERPROFILE\.ssh\id_ed25519 `
    -L 127.0.0.1:18000:127.0.0.1:<remote-port> klh@100.80.191.86
```

When the backend runs in Docker, use `DGX_LLM_API_BASE_URL=http://host.docker.internal:18000/v1`. Alternatively, run the tunnel inside the container network.

## 4. Verify

```powershell
cd backend
.venv\Scripts\python.exe scripts\dgx_check.py
$env:RUN_DGX_TESTS="1"; .venv\Scripts\python.exe -m pytest tests\dgx -v -rs
```

`dgx_check.py` first checks SSH: that the key file exists, its public fingerprint, and a non-interactive key-only login to `spark2`. It prints no key material. Then it checks that the endpoint points at the tunnel or `spark2`, TCP reachability, `/models`, that the configured model is actually served, and a schema-validated structured completion. If `json_schema` fails, it tells you to switch modes. The contract tests also confirm that a prompt-injection email is flagged rather than obeyed. In the UI, **Security & accounts → DGX Spark inference** shows live status, and the dashboard shows inference health.

## Adapter guarantees

- **Provider-neutral:** `app/llm/base.py` defines `LLMProvider`. `OpenAICompatibleProvider` is the implementation. Adding another API style means one new class.
- **Limits:** connect and read timeouts; a concurrency semaphore (`LLM_MAX_CONCURRENCY`); bounded retries with exponential backoff and jitter for timeouts, 429, 502/503/504 and transport errors; an input budget (`LLM_MAX_INPUT_CHARS`, with head and tail kept when truncating); and an output limit (`LLM_MAX_OUTPUT_TOKENS`).
- **Validation:** every response is parsed (tolerating code fences and `<think>` reasoning tags) and validated against a Pydantic schema. One repair attempt follows, and then the call fails. The model never chooses actions.
- **Metrics:** each call records request ID, task, model, status, latency, sizes and attempt count in `llm_calls`, with no content. These appear on the Analytics page.
