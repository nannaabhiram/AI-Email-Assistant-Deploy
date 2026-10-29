# Operations

## Local lifecycle (Windows): `npm start` / `npm stop`

Run from the project root (`scripts\launcher\`, no extra dependencies; Node ≥ 20).

| Command | What it does |
|---|---|
| `npm start` | 8 checked steps: project, venv, packages and `.env` files → previous MailPilot processes and ports 5173 / 8000 / 18000 → Supabase (starts it if Docker is up) → SSH key login to Spark 2 → tunnel to Ollama and check that `DGX_LLM_MODEL` is served → API until `/health/ready` → worker until `worker_started` → Vite until it answers. Then it opens the browser and prints the time taken. If it is already running and healthy, it only says so. |
| `npm stop` | Stops frontend, API, worker and the tunnel (whole process trees), then frees the ports. Safe to repeat, and works from a new terminal or after a reboot. |
| `npm run status` | Each component, plus whether Spark 2 is reachable and serves the model. |
| `npm run restart` | Stop, then start. Use it after editing `backend\.env`. |

- **Process ownership:** `.mailpilot\processes.json` records each component's PID and creation time. A PID that Windows has since reused for another program never matches, so it is never stopped. MailPilot processes from older terminals or `dev.ps1` are recognised by their command line (this project's path plus the component) and cleaned up too. Nothing is ever stopped by program name, and unrelated `python.exe`, `node.exe` or `ssh.exe` processes are left alone.
- **Port conflicts:** if a foreign program holds port 5173 or 8000, `npm start` stops and names it instead of killing it. An existing tunnel on 18000 that already serves the model is reused, not managed.
- **Spark 2 unavailable:** the app still starts, clearly marked "WITHOUT AI inference", and analysis is rule-based. Use `npm start -- --require-dgx` to fail instead. The model is never swapped for another one.
- **Failures and Ctrl+C:** if a step fails or you press Ctrl+C, everything started by that run is stopped and the last log lines are shown.
- **Only one launcher at a time:** `.mailpilot\launcher.lock`. A lock left by a closed terminal is detected and replaced.
- **Logs:** `.mailpilot\logs\{tunnel,api,worker,frontend}.log`.
- **Not touched by `npm stop`:** Supabase in Docker (stop it with `npx supabase@2.122.0 stop`), DGX Spark 2 and its Ollama service (only the local tunnel closes), and browser tabs (a tab cannot be identified and closed safely from outside the browser).
- **Timeouts** (seconds, environment variables): `MAILPILOT_API_TIMEOUT` (90), `MAILPILOT_WORKER_TIMEOUT` (60), `MAILPILOT_FRONTEND_TIMEOUT` (60), `MAILPILOT_TUNNEL_TIMEOUT` (30), `MAILPILOT_SUPABASE_TIMEOUT` (600), `MAILPILOT_STOP_GRACE` (5).
- **Tunnel:** the background tunnel is `scripts\launcher\tunnel.mjs`, which reconnects with backoff. It uses the same settings as `scripts\dgx-tunnel.ps1`, which remains for a visible, interactive tunnel window. Windows PowerShell cannot run without a console, so the launcher can't use it for the background tunnel.

## Deployment

1. **Database:** a hosted Supabase project. Apply the schema with `npx supabase@2.122.0 db push` (see SETUP.md).
2. **Backend:** build `backend/Dockerfile` once and run two processes from it:
   - API: `uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers` (the image default). Put it behind HTTPS.
   - Worker: `python -m app.jobs.worker`. Run at least one. Several are safe, because jobs are claimed with `SKIP LOCKED`.
   - Example: `docker compose --env-file backend/.env up --build -d`.
3. **Frontend:** `frontend/Dockerfile` (nginx, SPA fallback, security headers). Pass the `VITE_*` build args. Any static host also works: run `npm run build` and serve `dist/` with an `index.html` fallback.
4. **Inference:** a persistent SSH tunnel from the backend host to the DGX (a `scripts/dgx-tunnel.ps1` equivalent or a systemd `ssh -N -L` unit), or a private network route. Set `DGX_LLM_API_BASE_URL` accordingly.
5. Health checks: `GET /health` (liveness) and `GET /health/ready` (database). Inference health is at `GET /api/v1/diagnostics/llm` (authenticated).

Configuration is separated by environment: `ENVIRONMENT` is `development`, `test` or `production`. Each environment has its own `.env` file. Tests force their own values in `tests/conftest.py`.

## Backup and recovery

- **Database:** Supabase daily backups (point-in-time recovery on paid plans). For your own copies:
  ```powershell
  npx supabase@2.122.0 db dump --linked -f backup-schema.sql
  npx supabase@2.122.0 db dump --linked --data-only -f backup-data.sql
  ```
  Restore into a fresh project with `psql "<connection string>" -f backup-schema.sql -f backup-data.sql`.
- **`TOKEN_ENCRYPTION_KEY`** must be backed up separately. Without it, restored OAuth tokens are unusable and users must reconnect, though their data is preserved.
- **Storage:** stored attachments are re-creatable by re-extracting from Gmail and are optional.
- **Gmail is the source of truth for mail.** After a data loss, a full resync (Security & accounts → Full resync) rebuilds the mailbox data. Analyses are regenerated by the worker.

## Recovery behaviour

| Failure | Behaviour |
|---|---|
| DGX offline or tunnel down | Rule-based labelled results; LLM jobs deferred every 5 min without using retries; banner in the UI |
| Supabase or DB down | API `/health/ready` returns 503; worker backs off claim attempts; UI shows server-unreachable/stale banners |
| Gmail 429/5xx | Exponential backoff with `Retry-After`; the job is retried later |
| Gmail token revoked or expired | Account marked `needs_reauth`; banner with a Reconnect action |
| History cursor expired | Automatic full resync |
| Worker crash mid-job | Lease expires and the job is reclaimed. A mid-send crash is recovered without a duplicate send |
| Job keeps failing | Status `dead` after `max_attempts`; shown on the dashboard and in Security & accounts → Background jobs |

## Troubleshooting

| Symptom | Fix |
|---|---|
| `supabase start`: "ports are not available … forbidden" | A Windows reserved port range. Keep the 553xx ports in `config.toml` or pick ports outside `netsh int ipv4 show excludedportrange protocol=tcp`. |
| Frontend shows "Frontend not configured" | Create `frontend/.env.local` and restart `npm run dev`. |
| API 401 `jwks_unavailable` | `SUPABASE_URL` is wrong or unreachable from the backend. |
| API 401 `HS256 tokens are not accepted` | A legacy project: set `SUPABASE_JWT_SECRET`. |
| OAuth error `invalid_oauth_state` | The link expired (10 min) or was used twice. Start again. |
| OAuth error `missing_refresh_token` | Remove the app at <https://myaccount.google.com/permissions> and reconnect. |
| Gmail `redirect_uri_mismatch` | `GOOGLE_REDIRECT_URI` must equal the URI registered in Google Cloud exactly. |
| Account repeatedly `needs_reauth` after ~7 days | The OAuth app is in *Testing* status (7-day refresh tokens). Publish it, or reconnect. |
| "No DGX inference endpoint is configured" | Fill in `DGX_*` and run `scripts/dgx_check.py` (see DGX_SPARK.md). |
| UI says "Not configured" but the API log says `llm_configured=True` | An older API process still owns port 8000 and keeps the settings it started with. On Windows a second instance starts but never receives requests. Run `npm run restart`, which stops every MailPilot process (managed or left over) before starting. `npm start` refuses to start next to a foreign program on 8000, and the API reloads automatically when `backend\.env` changes. The startup log shows `pid`, `llm_endpoint` and `llm_model`. |
| DGX status "Unreachable" | `.env` is fine, but the tunnel is down. Start `.\scripts\dgx-tunnel.ps1` (spark2) and click Re-check. |
| DGX check: model "not served" | `DGX_LLM_MODEL` must match an ID from `/v1/models` exactly. |
| DGX check: structured completion fails | Set `DGX_LLM_STRUCTURED_OUTPUT=json_object` (or `prompt`). |
| `decrypt_failed` | `TOKEN_ENCRYPTION_KEY` changed. Restore it, or have users reconnect. |
| Using the transaction pooler: "prepared statement already exists" | Set `DATABASE_STATEMENT_CACHE_SIZE=0`. |
| Approved action never executes | The worker isn't running. Start `python -m app.jobs.worker`. |
| Vitest runs stale story files | Delete `frontend/node_modules/.vitest-cache`. |
