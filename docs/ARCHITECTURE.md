# Architecture

```
Browser (React SPA) ──Supabase Auth (session, PKCE)──► Supabase Auth
      │  Bearer <user JWT>
      ▼
FastAPI API ──verify JWT (JWKS/ES256)──► user_id
  │  user-scoped reads/edits: SET LOCAL ROLE authenticated + jwt claims  → RLS enforced
  │  system writes: privileged connection, always filtered by verified user_id
  ▼
Supabase Postgres ◄── worker (python -m app.jobs.worker)
  jobs queue                 ├─ gmail_sync ─────► Gmail API (OAuth tokens, encrypted)
  email_* / analysis         ├─ analyze_message ─► rules + DGX LLM (SSH tunnel)
  tasks / commitments        ├─ summarize_thread / extract_attachment / generate_briefing
  drafts / action_approvals  ├─ execute_action ──► Gmail send / modify (approved only)
  audit_logs / llm_calls     └─ scheduler: syncs, briefings, reminders, retention, embeddings
Supabase Storage (private "attachments" bucket, signed URLs, optional)
```

## Data model (supabase/migrations)

`profiles`, `user_settings`, `connected_accounts`, `oauth_credentials`, `oauth_states`, `sync_state`, `gmail_labels`, `email_threads`, `email_messages`, `email_attachments`, `email_analysis`, `thread_summaries`, `contacts`, `contact_preferences`, `tasks`, `commitments`, `meetings`, `drafts`, `draft_versions`, `action_approvals`, `action_executions`, `search_documents` (tsvector plus an optional pgvector embedding), `feedback`, `briefing_runs`, `notifications`, `jobs`, `llm_calls`, `audit_logs`.

- UUID keys, foreign keys with cascades, and `created_at`/`updated_at` triggers.
- Gmail identity is unique per account: `unique (account_id, gmail_message_id)` and `unique (account_id, gmail_thread_id)`. Every write is an idempotent upsert.
- Optimistic concurrency uses `version` columns (settings, tasks, commitments, drafts). The API requires the version the client read and returns 409 on conflict.
- Retention: `purge_expired_data()` deletes mail older than each user's `email_retention_days`, plus expired OAuth states, old jobs and old metrics, and expires stale approvals. The worker runs it daily.

## Sync

- **Initial**: the profile's `historyId` is captured first, then `messages.list newer_than:<lookback>d` is paginated up to `sync_max_messages`. Only unknown IDs are fetched in `format=full`, with bounded concurrency; known IDs are refreshed with `format=minimal`.
- **Incremental**: `history.list` (messageAdded, messageDeleted, labelAdded, labelRemoved). An expired history cursor (404) triggers an automatic full resync.
- **Resilience**: retries with backoff on 429/5xx and rate-limit 403s, honouring `Retry-After`. A 401 forces one token refresh. A revoked grant marks the account `needs_reauth`.
- The parser handles nested multiparts, charsets, RFC 2047 subjects, safe HTML→text (scripts, styles, iframes and comments removed; nothing fetched), link extraction, attachments by stable `partId`, and inline `text/calendar`.

## Analysis pipeline (`app/analysis/pipeline.py`)

1. **Deterministic features:** deadline extraction (needs a cue like "by", "due" or "valid for"; resolved in the user's timezone; explicit vs inferred), request and reply cues, newsletter/notification detection, security-alert and incident patterns, contact importance, VIP status and thread participation, phishing heuristics, duplicate detection (same sender and normalized content within 14 days), and ICS meetings.
2. **LLM** (if available): strict system rules, untrusted content wrapped in nonce delimiters, schema-validated JSON.
3. **Merge and validate:** LLM tasks, commitments and deadlines are kept only if their *evidence quote actually appears in the email*. "By me" commitments are accepted only from messages the user sent. Components are blended (70% LLM, 30% rules).
4. **Scoring:** `score = Σ weight × component` (deadline, action, impact, sender, context), using user-editable weights and thresholds. **Escalations are applied last and cannot be suppressed:** security alerts, critical incidents, high phishing risk, and an action-required deadline within 24 hours always mean HIGH. Contact floor and ceiling rules and mutes apply before escalations. Low confidence sets `needs_review` without changing the priority.
5. Persist the analysis, suggested tasks and commitments (unconfirmed items are `suggested`), and meetings. Overrides go to `feedback` for evaluation.

## Approval and execution engine (`app/actions/engine.py`)

```
PROPOSED → PENDING_APPROVAL → APPROVED → EXECUTING → SUCCEEDED
   ↘ REJECTED / EXPIRED / CANCELLED          ↘ FAILED → (retry) EXECUTING
```

- Transitions are enforced by the `action_approvals_guard` database trigger. Parameters are immutable, and `APPROVED` requires `approved_by = user_id`.
- An approval stores the exact parameters and their SHA-256 `params_hash`. To approve, the client must send back the hash it displayed.
- Editing a draft cancels its open approvals through the `drafts_invalidate_approvals` trigger. Execution also recomputes the hash from the current draft.
- Execution locks the row, revalidates owner, expiry, account status and scope, and moves to `EXECUTING` atomically, so concurrent workers can't both run it.
- **Duplicate-send prevention:** each send uses a deterministic `Message-ID: <mailpilot-{approval_id}@domain>`. Any retry, including recovery of an `EXECUTING` state left behind by a crashed worker, first searches Gmail for that Message-ID and records success instead of sending again.
- The engine handles `send_reply` (gmail.send or modify) plus `archive`, `apply_label`, `remove_label`, `mark_read` and `mark_unread` (gmail.modify). If a scope is missing, the API returns `permission_upgrade_required` and the UI requests the incremental grant.
- Calendar actions and sender filters are recommendations only. They are not executed (see STATUS.md).

## Search

The NL query is turned into structured filters: LLM `SearchQueryOutput`, or the deterministic parser if the LLM is unavailable. The SQL combines metadata filters (sender, priority, reply-needed without a later sent reply, due today, attachments, digit-normalized amounts, dates) with Postgres FTS (`websearch_to_tsquery`, weighted subject over body, attachments included). It optionally adds pgvector distance merged by reciprocal-rank fusion. Search runs under the user's RLS role and an explicit `user_id` filter.

## Jobs

The `claim_jobs()` SQL function uses `FOR UPDATE SKIP LOCKED` with a lease (`locked_until`). Expired leases from crashed workers become claimable again. A partial unique index on `(job_type, dedupe_key)` for live jobs prevents duplicates. Failures back off exponentially up to `max_attempts` and then become `dead`, which the dashboard shows. Remote-inference outages *defer* jobs without consuming attempts. The worker shuts down gracefully on SIGINT/SIGTERM.

## Frontend

The shared design system lives in `src/components/{ui,mail,work,insights,layout}`. It is presentational, has no API calls, uses semantic tokens for light and dark themes, and every component has stories. Pages in `src/pages` compose these components with data hooks (`src/hooks/queries.ts`, TanStack Query with polling for running jobs and approvals). All API access goes through the typed client `src/lib/api.ts`, which uses only the user's session token.
