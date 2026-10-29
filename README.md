# MailPilot AI

A personal AI email agent. It connects to Gmail, synchronizes your mail into Supabase, and analyses each message on **your own NVIDIA DGX Spark inference server**. It assigns HIGH/MEDIUM/LOW priority with explanations, summarizes threads, extracts tasks, commitments and deadlines with evidence, flags phishing, analyses attachments, drafts replies, supports natural-language search, and produces daily briefings.

**Human approval is required for every consequential action.** MailPilot never sends, archives, labels or deletes mail on its own. Every action is a proposal that you approve against its exact content.

| Layer | Technology |
|---|---|
| Frontend | React 19.3, TypeScript 7.0 (strict), Vite 8.3, Tailwind CSS 4.3, React Router 8.5, TanStack Query 5.105, React Hook Form 7.91 + Zod 4.6, Recharts 3.10, Lucide |
| Component library | Storybook 10.6 (40 story files, 158 story tests with interaction tests and axe accessibility checks) |
| Backend | Python 3.14, FastAPI 0.162, Pydantic 2.14, SQLAlchemy 2.1 (asyncpg), structlog |
| Data | Supabase Postgres (authoritative store, RLS on every table), Supabase Auth (JWKS/ES256), Supabase Storage (private bucket) |
| AI | Remote DGX Spark through a provider-neutral, OpenAI-compatible adapter (vLLM / SGLang / TensorRT-LLM / NIM / llama.cpp), reached over an SSH tunnel |
| Mail | Gmail REST API with OAuth 2.0 + PKCE, incremental sync via the History API |
| Jobs | Durable Postgres queue (`FOR UPDATE SKIP LOCKED`, leases, retries, dedupe) |

## Repository layout

```
backend/            FastAPI app, worker, tests, scripts/dgx_check.py
  app/api/v1/       versioned REST endpoints (59 paths, OpenAPI at /docs)
  app/gmail/        OAuth, client (retries/backoff), MIME parser, sync, store
  app/llm/          provider-neutral LLM layer, prompts, structured output schemas
  app/analysis/     rules, scoring, phishing, deadlines, pipeline, search, briefings, attachments
  app/actions/      drafts and the approval/execution engine
  app/jobs/         durable queue, handlers, worker + scheduler
  tests/            unit/, integration/ (real Supabase), dgx/ (live contract tests)
frontend/           React app
  src/components/   design system (ui/, mail/, work/, insights/, layout/) + *.stories.tsx
  src/pages/        16 application pages
  src/test/         story/a11y runner, form and page-flow tests
  e2e/              Playwright end-to-end tests (desktop + mobile)
supabase/           config.toml, migrations/ (schema, triggers, RLS, storage), seed.sql (synthetic)
scripts/            launcher/ (npm start/stop/status), dev.ps1, check.ps1, dgx-tunnel.ps1
docs/               setup, DGX, architecture, security, operations, status
```

## Quick start (Windows PowerShell)

Prerequisites: Python 3.12+ (3.14 tested), Node 24+, Docker Desktop, Git, OpenSSH.

```powershell
# 1. Backend environment
cd backend
py -3.14 -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
Copy-Item .env.example .env        # then edit .env (see docs/SETUP.md)
cd ..

# 2. Frontend environment
cd frontend
npm ci
Copy-Item .env.example .env.local  # then set VITE_SUPABASE_PUBLISHABLE_KEY
cd ..

# 3. Start everything (Supabase check, Spark 2 tunnel, API, worker, frontend) and open the browser
npm start
# ...and later
npm stop
```

- Frontend: <http://localhost:5173>. The local seed login is `demo@mailpilot.test` / `mailpilot-demo-password` (synthetic data).
- API docs: <http://localhost:8000/docs>
- Storybook: <http://localhost:6006>

To run every check, use `.\scripts\check.ps1`. Add `-E2E` to include the browser tests.

## Documentation

- [docs/SETUP.md](docs/SETUP.md) covers Supabase, Google OAuth / Gmail, and every environment variable.
- [docs/DGX_SPARK.md](docs/DGX_SPARK.md) covers remote inference, SSH tunnelling and diagnostics.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) explains the design, data flow, approval state machine and scoring.
- [docs/SECURITY.md](docs/SECURITY.md) has the threat model, prompt-injection defences and security checklist.
- [docs/OPERATIONS.md](docs/OPERATIONS.md) covers deployment, backup/recovery, retention and troubleshooting.
- [docs/STATUS.md](docs/STATUS.md) lists feature status, test results, blockers and remaining work.
- [docs/USER_GUIDE.md](docs/USER_GUIDE.md) explains how to use the application.
