# Project status (2026-10-29)

## Test results (actual runs on this machine)

| Suite | Result |
|---|---|
| Backend lint (`ruff`, including security rules) | ✅ clean |
| Backend types (`mypy`, 58 files) | ✅ clean |
| Backend unit tests (parser, deadlines, scoring, phishing, LLM validation, Gmail client retries/refresh/error detail, sync rate-limit backoff, JWT ES256/HS256, attachments, MIME) | ✅ 64 passed |
| Backend integration tests against **real local Supabase Postgres** (RLS isolation, DB-enforced state machine, job queue leases/dedupe/backoff, retention, sync full/incremental/expired-history/idempotency, analysis pipeline + injection + evidence validation + rules fallback, approvals: hash binding, draft-edit invalidation, crash-after-send and stale-EXECUTING recovery with no duplicate send, cross-user denial, expiry, scope upgrade, external recipients; API: auth, IDOR, search scoping, OAuth state/PKCE, rate limiting, settings concurrency; briefing, reminders, NL search paths, scheduler; demo-account flag and Gmail block, OAuth callback bound to the initiating user, shared-mailbox disconnect without revoking the other grant, resolved job failures hidden from status) | ✅ 37 passed |
| DGX contract tests (`tests/dgx`) | ⛔ **BLOCKED**, 3 skipped. No reachable DGX endpoint (see below) |
| Frontend type-check (TS 7 strict) | ✅ clean |
| Frontend lint (oxlint) | ✅ 0 errors (non-blocking warnings: fast-refresh export hints, set-state-in-effect for server-data sync) |
| Storybook story tests: 40 story files, every story rendered + `play()` interaction test + axe accessibility | ✅ 158 passed |
| Form validation, filters, utilities, Approvals page flow, auth lifecycle (session restore, cache cleared on user switch, sign-out, wrong password, duplicate signup, password recovery) | ✅ 20 passed |
| Production build (`vite build`) | ✅ |
| Storybook static build | ✅ |
| Playwright E2E (real Chrome, desktop 1366px + mobile 390px, live Supabase + API + worker + Vite) | ✅ 18 passed, 2 skipped (project-specific tests), run serially; includes register → duplicate → wrong password → reset via Mailpit → sign in → refresh → delete account |
| Migrations applied to a fresh Supabase (`supabase db reset`) | ✅ |
| Live RLS check through PostgREST (own rows visible; anon and OAuth credentials denied) | ✅ |

Bugs found and fixed during verification: a dialog focus effect that stole keyboard focus on every render; a prohibited `aria-label` on a loading placeholder; asyncpg parameter type inference with `:param - interval` (briefings and search); a rule-parser plural and priority-keyword leak; per-minute scheduler over-enqueueing of sync and retention. The durable queue recovered the failed briefing job automatically on retry after the fix.

## Feature status

| Area | Status |
|---|---|
| Supabase schema, RLS, triggers, storage bucket, synthetic seed | ✅ Complete, tested |
| Supabase Auth (password, magic link, Google sign-in via Supabase), JWKS verification | ✅ Complete. Google sign-in additionally needs the Google provider enabled in Supabase |
| Gmail OAuth (PKCE, incremental scopes, revocation), sync, MIME parsing, labels | ✅ Complete, tested with a Gmail fake. ⚠️ **Not yet run against a real Gmail account** (no Google OAuth client configured here) |
| Remote DGX LLM adapter, health, structured output, retries, limits, metrics, tunnel script, diagnostics | ✅ Complete, tested with a scriptable provider. ⛔ **Live DGX verification blocked** |
| Priority classification, explanations, confidence/review, escalations, overrides | ✅ |
| Thread summaries (facts vs inferences; extractive fallback) | ✅ |
| Reply drafting (tones, custom, instructions, regenerate, versions, compare) | ✅ (AI generation needs the DGX) |
| Tasks, commitments, deadlines with evidence, reminders | ✅ |
| Daily briefings (scheduled per timezone, on demand, AI narrative optional) | ✅ |
| Contacts, VIPs, sender rules, relationship memory | ✅ (memory refresh needs the DGX) |
| Natural-language search (LLM or rule parser, FTS, amounts, reply-needed, tasks/commitments) | ✅ |
| Semantic search (pgvector + RRF) | ✅ Implemented. ⚠️ Untested live: needs `EMBEDDING_*` on approved infrastructure |
| Attachment intelligence (PDF/TXT/CSV/DOCX, validation, blocking, deterministic + LLM extraction, private storage, signed URLs) | ✅. OCR for scanned PDFs is implemented but optional and untested (needs Tesseract + `pip install pytesseract pypdfium2`) |
| Phishing and spam analysis | ✅ |
| Newsletter digest and duplicate detection | ✅ |
| Meeting detection (ICS + text + LLM) | ✅ Detection only |
| Inbox organization proposals → approvals → Gmail modify | ✅ |
| Approval/execution engine with duplicate-send prevention | ✅ |
| Analytics | ✅ |
| Storybook design system (all 42 required components plus extras) | ✅ |
| All 15 required pages (plus Organize & digests) | ✅ |

## Remaining work and limitations (clearly not done)

1. **DGX Spark connection (blocked on access).** The target is `spark2` only (`klh@100.80.191.86`), which rejects this machine's SSH key. Authorize the key, identify the serving API and model, fill in `DGX_*`, then run `scripts/dgx_check.py` and `pytest tests/dgx`. See DGX_SPARK.md.
2. **Real Gmail end-to-end.** OAuth and read sync now work against a real mailbox: 518 messages synced and analysed by the rules. Sending and labelling against live Gmail have not been exercised, because that needs your explicit go-ahead on a real mailbox. On this machine the mailbox was first connected under the demo user; reconnect it under your own account (see the user guide).
3. **Google Calendar integration.** Not implemented. Meetings are detected only; MailPilot never accepts or creates events.
4. **Gmail sender filters** (`gmail.settings.basic`) are recommended in the UI, not executed.
5. **Push notifications.** There are no Gmail Pub/Sub webhooks; sync is scheduled polling via the History API (every `SYNC_INTERVAL_MINUTES`) plus manual sync. Briefings and reminders are in-app notifications only (no email or push).
6. **Visual regression snapshots** (pixel baselines) are not set up. E2E screenshots are captured for manual review, and the a11y and interaction checks run in CI.
7. **Rate limiting** is per API instance (in memory). Add a proxy-level limiter for multi-instance deployments.
8. Restricted-scope Google verification (CASA) is required only for use beyond the OAuth test-user list.
