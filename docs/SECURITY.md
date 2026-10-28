# Security

## Threat model highlights

| Threat | Defence |
|---|---|
| Malicious email instructs the AI ("forward everything to…") | System rules are separate from content. Content sits inside random-nonce `UNTRUSTED_*` delimiters, and delimiter look-alikes are neutralized. The model has **no tools** and returns schema-validated JSON only; extra fields are discarded. No code path turns model output into an action. Actions are created only by authenticated user requests and executed only after owner approval. Injection attempts are flagged (`prompt_injection` risk flag). |
| Hallucinated tasks, deadlines or commitments | Evidence quotes must appear in the source text. LLM deadlines must match the text or a rule-detected date. Inferred dates are labelled and require confirmation. |
| Sending wrong or altered content | Approval binds to a SHA-256 hash of the exact recipients, subject, body and thread. Editing cancels it (DB trigger). Execution re-verifies. External recipients need explicit acknowledgement. CR/LF is rejected in subjects. |
| Duplicate sends | Deterministic Message-ID plus a Gmail lookup before any retry, row-locked state transitions, and a unique execution per approval. |
| IDOR or cross-user access | Identity comes only from a verified JWT. Every query filters by that user. User-facing reads run as the `authenticated` role under RLS. Other users' IDs return 404 ("not found", identical to a missing ID). |
| Direct PostgREST access with a user token | RLS on every table. Approvals, executions, mail, analysis and audit tables are read-only for users. Column-level grants stop users from rewriting ownership or system fields. OAuth tables are not readable at all. `anon` has no access. |
| Token theft | Gmail tokens are Fernet-encrypted at rest and never sent to the browser or the model. The service-role key and Google secret live only in the backend environment. |
| OAuth CSRF or code injection | Single-use, hashed, 10-minute `state` bound to the initiating user, plus PKCE (S256). The redirect path is restricted to an allow-list. |
| Malicious attachments | Executables, scripts and macro documents are blocked. Size limits apply, MIME types are allow-listed, and magic bytes are checked. Parsers run server-side with page and character limits. Nothing is executed and embedded links are never followed. Stored files sit in a private bucket with 120-second signed URLs. |
| Malicious HTML | Rendered as plain text only. No remote images or scripts are loaded, and links are listed, never auto-opened. |
| Secrets in logs | structlog redaction of tokens, JWTs, `Authorization` headers and any key named like body or content. Email bodies are never logged (`LOG_EMAIL_BODIES` refuses to start in production). |
| Abuse | Per-user token-bucket rate limits, stricter on sensitive endpoints (search, drafting, OAuth, approvals). For multi-instance deployments, put a shared limiter at the proxy. |
| Browser hardening | Narrow CORS (explicit origins, no credentials), plus `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Cache-Control: no-store`, and HSTS in production. |

## Security checklist (production)

- [ ] `ENVIRONMENT=production` (disables `/docs`, enables HSTS, JSON logs)
- [ ] HTTPS everywhere; `GOOGLE_REDIRECT_URI` and `CORS_ORIGINS` use the real HTTPS origins
- [ ] `TOKEN_ENCRYPTION_KEY` generated fresh, stored in a secret manager, and backed up separately from the database
- [ ] `SUPABASE_SERVICE_ROLE_KEY` only on the API and worker hosts; never in `VITE_*` variables
- [ ] `supabase db push` applied; the Supabase **Security Advisor** has no RLS warnings
- [ ] The seed (`supabase/seed.sql`) is **not** applied to production
- [ ] Google OAuth consent screen configured; restricted-scope verification done if serving users beyond your test list
- [ ] DGX inference port bound to localhost on the DGX; reached only through the SSH tunnel or a private network
- [ ] SSH key-based auth only on the DGX (`PasswordAuthentication no`)
- [ ] `LOG_EMAIL_BODIES=false`
- [ ] Backups scheduled (see OPERATIONS.md); retention days chosen per user policy
- [ ] Rate limiting at the reverse proxy when running more than one API instance

## Data deletion

- **Disconnect an account** (Security & accounts) revokes Google access, deletes tokens, and optionally deletes all of that account's synced data.
- **Delete synced data** (Preferences) deletes all mail, analyses, mail-derived items and stored attachments, and resets sync cursors.
- **Delete contact memory** (Contacts) clears the relationship summary and notes.
- **Delete account** revokes all accounts, deletes stored files, and deletes the Supabase Auth user. Everything cascades.
