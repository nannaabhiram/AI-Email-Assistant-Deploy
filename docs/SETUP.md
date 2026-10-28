# Setup

## 1. Supabase

### Local (development)

Docker Desktop must be running.

```powershell
npx supabase@2.122.0 start -x studio,imgproxy,edge-runtime,logflare,vector,supavisor,realtime,postgres-meta
```

`supabase/config.toml` uses ports **55320–55329**. The CLI defaults (543xx) fall inside a Windows/Hyper-V reserved range on this machine; check yours with `netsh int ipv4 show excludedportrange protocol=tcp`.

`start` applies every file in `supabase/migrations/` in order, then `supabase/seed.sql`. To rebuild from scratch:

```powershell
npx supabase@2.122.0 db reset      # re-applies migrations + synthetic seed
npx supabase@2.122.0 status        # prints URL, publishable key, secret key, DB URL
```

Local values:

| Variable | Value |
|---|---|
| `SUPABASE_URL` / `VITE_SUPABASE_URL` | `http://127.0.0.1:55321` |
| `DATABASE_URL` | `postgresql+asyncpg://postgres:postgres@127.0.0.1:55322/postgres` |
| `SUPABASE_SERVICE_ROLE_KEY` | "Secret key" from `supabase status` (backend only) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | "Publishable key" from `supabase status` |

### Hosted project (production)

1. Create a project at <https://supabase.com/dashboard>.
2. Apply the migrations:
   ```powershell
   npx supabase@2.122.0 login
   npx supabase@2.122.0 link --project-ref <your-project-ref>
   npx supabase@2.122.0 db push          # applies supabase/migrations/*.sql
   ```
   Do **not** run `seed.sql` against production. It creates a demo user.
3. Under **Project Settings → API**, copy the project URL, the publishable key (for the frontend) and the secret/service-role key (for the backend only).
4. Under **Project Settings → Database**, use the **session pooler** or direct connection string as `DATABASE_URL` (`postgresql+asyncpg://...`). If you use the transaction pooler (port 6543), also set `DATABASE_STATEMENT_CACHE_SIZE=0`.
5. Under **Authentication → URL configuration**, set the Site URL to your frontend origin and add `<origin>/dashboard` and `<origin>/onboarding` as redirect URLs.
6. Asymmetric JWT signing keys (the default for new projects) need no secret: the backend verifies tokens using the project's JWKS. For a legacy HS256 project, set `SUPABASE_JWT_SECRET`.
7. RLS is enabled by the migrations. To confirm, check **Database → Advisors** for security warnings after `db push`.

## 2. Google OAuth / Gmail API

1. In the [Google Cloud Console](https://console.cloud.google.com/), create a project or pick an existing one.
2. **APIs & Services → Library**: enable the **Gmail API**.
3. **APIs & Services → OAuth consent screen**:
   - User type: **External** (or Internal for a Workspace organisation).
   - Fill in the app name, support email, and developer contact.
   - Scopes: add `.../auth/gmail.readonly`, plus `.../auth/gmail.send` and `.../auth/gmail.modify` if you will use sending and organising. MailPilot requests these incrementally, only when the user enables the feature.
   - **Test users**: while the app is in *Testing* status, add every Gmail address that will connect. Refresh tokens for apps in Testing status expire after 7 days. The user then sees "needs to be reconnected" and reconnects with one click.
4. **Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**
   - Authorised redirect URI: `http://localhost:8000/api/v1/gmail/oauth/callback` for local use. Use your API origin for production; it must match `GOOGLE_REDIRECT_URI` exactly.
5. Copy the client ID and secret into `backend/.env` as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
6. **Verification:** `gmail.readonly`, `gmail.modify` and `gmail.send` are *restricted* scopes. Using them with users outside your test-user list requires Google's OAuth app verification and a third-party security assessment (CASA). Personal or internal use with listed test users does not.

Flow summary: the app calls `POST /api/v1/gmail/oauth/start`. That creates a single-use, hashed `state` (10 minutes) and a PKCE verifier, then redirects to Google. Google calls `/api/v1/gmail/oauth/callback`. The backend validates the state, exchanges the code, encrypts the tokens with `TOKEN_ENCRYPTION_KEY`, stores them in `oauth_credentials`, and queues the first sync. If Google returns no refresh token, remove the app under <https://myaccount.google.com/permissions> and connect again.

## 3. Backend `.env`

Copy `backend/.env.example` to `backend/.env`. Required:

```ini
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
DATABASE_URL=postgresql+asyncpg://...
TOKEN_ENCRYPTION_KEY=...   # python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
FRONTEND_URL=http://localhost:5173
CORS_ORIGINS=http://localhost:5173
```

Optional:
- `DGX_*`: see [DGX_SPARK.md](DGX_SPARK.md). Without it, analysis is rule-based and clearly labelled.
- `EMBEDDING_*`: semantic search, only with an embedding server on approved infrastructure.
- `OCR_ENABLED=true`: OCR for scanned PDFs. Requires `pip install pytesseract pypdfium2` and a Tesseract installation (`TESSERACT_CMD`).

Keep `TOKEN_ENCRYPTION_KEY` safe. If it changes, stored Gmail tokens can no longer be decrypted and every account must reconnect.

## 4. Frontend `.env.local`

```ini
VITE_SUPABASE_URL=http://127.0.0.1:55321
VITE_SUPABASE_PUBLISHABLE_KEY=<publishable key>
VITE_API_BASE_URL=http://localhost:8000
```

Only public values belong here. They are compiled into the browser bundle.

## 5. Run

```powershell
.\scripts\dev.ps1 -Storybook
```

Or start each part manually:

```powershell
cd backend;  .venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
cd backend;  .venv\Scripts\python.exe -m app.jobs.worker
cd frontend; npm run dev
cd frontend; npm run storybook
```

The worker must be running for sync, analysis, summaries, attachment extraction, briefings, reminders, retention and **approved actions** (sends, labels and archives run as jobs).
