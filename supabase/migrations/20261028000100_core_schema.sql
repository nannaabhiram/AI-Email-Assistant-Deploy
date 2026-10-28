-- MailPilot AI: core schema.
-- Supabase Postgres is the authoritative store. Every user-owned row carries user_id
-- (references auth.users via profiles) so Row Level Security can scope access.

create extension if not exists pg_trgm with schema extensions;
create extension if not exists vector with schema extensions;

-- ---------------------------------------------------------------------------
-- Enumerations
-- ---------------------------------------------------------------------------
create type public.priority_level as enum ('HIGH', 'MEDIUM', 'LOW');
create type public.analysis_source as enum ('llm', 'rules', 'hybrid');
create type public.analysis_status as enum ('pending', 'queued', 'done', 'failed', 'unavailable');
create type public.account_status as enum ('active', 'needs_reauth', 'disconnected', 'error');
create type public.risk_level as enum ('none', 'low', 'medium', 'high');
create type public.date_type as enum ('explicit', 'inferred', 'none');
create type public.task_status as enum ('suggested', 'open', 'done', 'dismissed');
create type public.commitment_direction as enum ('by_me', 'to_me');
create type public.commitment_status as enum ('suggested', 'open', 'fulfilled', 'cancelled');
create type public.draft_status as enum ('draft', 'pending_approval', 'approved', 'sent', 'discarded');
create type public.action_type as enum (
  'send_reply', 'archive', 'apply_label', 'remove_label', 'mark_read', 'mark_unread'
);
create type public.approval_state as enum (
  'PROPOSED', 'PENDING_APPROVAL', 'APPROVED', 'EXECUTING', 'SUCCEEDED',
  'REJECTED', 'EXPIRED', 'FAILED', 'CANCELLED'
);
create type public.job_status as enum ('queued', 'running', 'succeeded', 'failed', 'dead');

-- ---------------------------------------------------------------------------
-- Identity and settings
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_settings (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  timezone text not null default 'UTC',
  briefing_enabled boolean not null default true,
  briefing_time time not null default '08:00',
  notification_prefs jsonb not null default '{"in_app": true, "reminders": true, "briefing": true}',
  priority_thresholds jsonb not null default '{"high": 70, "medium": 40}',
  scoring_weights jsonb not null default
    '{"deadline": 0.30, "action": 0.25, "impact": 0.20, "sender": 0.15, "context": 0.10}',
  review_confidence_threshold numeric(3, 2) not null default 0.55
    check (review_confidence_threshold between 0 and 1),
  auto_analyze boolean not null default true,
  attachment_auto_extract boolean not null default false,
  attachment_max_bytes integer not null default 10485760 check (attachment_max_bytes between 1024 and 52428800),
  store_attachments boolean not null default false,
  email_retention_days integer not null default 365 check (email_retention_days between 7 and 3650),
  sync_lookback_days integer not null default 30 check (sync_lookback_days between 1 and 365),
  sync_max_messages integer not null default 2000 check (sync_max_messages between 50 and 20000),
  default_reply_tone text not null default 'professional',
  newsletter_digest boolean not null default true,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Connected Gmail accounts and OAuth material
-- ---------------------------------------------------------------------------
create table public.connected_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  provider text not null default 'gmail' check (provider in ('gmail')),
  email_address text not null,
  status public.account_status not null default 'active',
  granted_scopes text[] not null default '{}',
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider, email_address)
);
create index connected_accounts_user_idx on public.connected_accounts (user_id);

-- Encrypted OAuth tokens. RLS is enabled with no policies, so only trusted backend
-- connections (service role / postgres) can read them. Never exposed to browsers.
create table public.oauth_credentials (
  account_id uuid primary key references public.connected_accounts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  encrypted_refresh_token text not null,
  encrypted_access_token text,
  access_token_expires_at timestamptz,
  updated_at timestamptz not null default now()
);

-- One-time OAuth state values (CSRF protection + PKCE verifier). Stored hashed.
create table public.oauth_states (
  state_hash text primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  encrypted_code_verifier text not null,
  requested_scopes text[] not null,
  redirect_path text not null default '/settings/accounts',
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index oauth_states_expiry_idx on public.oauth_states (expires_at);

create table public.sync_state (
  account_id uuid primary key references public.connected_accounts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  history_id text,
  status text not null default 'idle' check (status in ('idle', 'running', 'failed')),
  last_full_sync_at timestamptz,
  last_successful_sync_at timestamptz,
  last_attempt_at timestamptz,
  last_error text,
  messages_synced bigint not null default 0,
  updated_at timestamptz not null default now()
);

create table public.gmail_labels (
  account_id uuid not null references public.connected_accounts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  label_id text not null,
  name text not null,
  label_type text not null default 'user',
  updated_at timestamptz not null default now(),
  primary key (account_id, label_id)
);

-- ---------------------------------------------------------------------------
-- Mail
-- ---------------------------------------------------------------------------
create table public.email_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  account_id uuid not null references public.connected_accounts (id) on delete cascade,
  gmail_thread_id text not null,
  subject text,
  snippet text,
  message_count integer not null default 0,
  participants jsonb not null default '[]',
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, gmail_thread_id)
);
create index email_threads_user_last_idx on public.email_threads (user_id, last_message_at desc);

create table public.email_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  account_id uuid not null references public.connected_accounts (id) on delete cascade,
  thread_id uuid not null references public.email_threads (id) on delete cascade,
  gmail_message_id text not null,
  gmail_thread_id text not null,
  rfc822_message_id text,
  in_reply_to text,
  references_header text,
  from_address text,
  from_name text,
  reply_to text,
  to_addresses jsonb not null default '[]',
  cc_addresses jsonb not null default '[]',
  bcc_addresses jsonb not null default '[]',
  subject text,
  snippet text,
  body_text text,
  has_html boolean not null default false,
  label_ids text[] not null default '{}',
  is_unread boolean not null default false,
  is_sent boolean not null default false,
  internal_date timestamptz not null,
  size_estimate integer,
  headers jsonb not null default '{}',
  links jsonb not null default '[]',
  calendar_data text,
  content_hash text,
  has_attachments boolean not null default false,
  is_deleted boolean not null default false,
  analysis_status public.analysis_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, gmail_message_id)
);
create index email_messages_user_date_idx on public.email_messages (user_id, internal_date desc);
create index email_messages_thread_idx on public.email_messages (thread_id, internal_date);
create index email_messages_from_idx on public.email_messages (user_id, lower(from_address));
create index email_messages_hash_idx on public.email_messages (user_id, content_hash);
create index email_messages_analysis_idx on public.email_messages (analysis_status) where analysis_status in ('pending', 'queued');
create index email_messages_subject_trgm on public.email_messages using gin (subject extensions.gin_trgm_ops);

create table public.email_attachments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  message_id uuid not null references public.email_messages (id) on delete cascade,
  part_id text not null,
  filename text not null default '',
  mime_type text not null default 'application/octet-stream',
  size_bytes integer not null default 0,
  sha256 text,
  storage_path text,
  extraction_status text not null default 'not_requested'
    check (extraction_status in ('not_requested', 'pending', 'done', 'failed', 'unsupported', 'too_large', 'blocked')),
  extraction_error text,
  extracted_text text,
  extraction jsonb not null default '{}',
  risk_flags jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (message_id, part_id)
);
create index email_attachments_user_idx on public.email_attachments (user_id, created_at desc);

create table public.email_analysis (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  message_id uuid not null unique references public.email_messages (id) on delete cascade,
  source public.analysis_source not null,
  model text,
  prompt_version text,
  priority public.priority_level not null,
  priority_score integer not null check (priority_score between 0 and 100),
  rule_score integer check (rule_score between 0 and 100),
  components jsonb not null default '{}',
  user_override_priority public.priority_level,
  effective_priority public.priority_level generated always as (coalesce(user_override_priority, priority)) stored,
  summary text not null default '',
  explanation text not null default '',
  confidence numeric(3, 2) not null default 0 check (confidence between 0 and 1),
  needs_review boolean not null default false,
  reply_needed boolean not null default false,
  action_required boolean not null default false,
  suggested_action text,
  deadline_at timestamptz,
  deadline_timezone text,
  deadline_text text,
  deadline_type public.date_type not null default 'none',
  entities jsonb not null default '{}',
  category text,
  is_newsletter boolean not null default false,
  is_notification boolean not null default false,
  duplicate_of uuid references public.email_messages (id) on delete set null,
  escalation_reason text,
  risk_level public.risk_level not null default 'none',
  risk_flags jsonb not null default '[]',
  analyzed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index email_analysis_user_priority_idx on public.email_analysis (user_id, effective_priority);
create index email_analysis_user_deadline_idx on public.email_analysis (user_id, deadline_at) where deadline_at is not null;

create table public.thread_summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  thread_id uuid not null unique references public.email_threads (id) on delete cascade,
  source public.analysis_source not null,
  model text,
  overview text not null,
  key_points jsonb not null default '[]',
  decisions jsonb not null default '[]',
  open_questions jsonb not null default '[]',
  tasks jsonb not null default '[]',
  people jsonb not null default '[]',
  facts jsonb not null default '[]',
  inferences jsonb not null default '[]',
  next_action text,
  message_count_at_summary integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Contacts and relationship memory
-- ---------------------------------------------------------------------------
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  email text not null,
  display_name text,
  domain text,
  is_vip boolean not null default false,
  importance integer not null default 50 check (importance between 0 and 100),
  notes text,
  relationship_summary text,
  relationship_summary_at timestamptz,
  inbound_count integer not null default 0,
  outbound_count integer not null default 0,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, email)
);
create index contacts_user_vip_idx on public.contacts (user_id, is_vip, importance desc);

create table public.contact_preferences (
  contact_id uuid primary key references public.contacts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  priority_floor public.priority_level,
  priority_ceiling public.priority_level,
  muted boolean not null default false,
  digest boolean not null default false,
  preferred_tone text,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Tasks, commitments, meetings
-- ---------------------------------------------------------------------------
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  source_message_id uuid references public.email_messages (id) on delete set null,
  source_thread_id uuid references public.email_threads (id) on delete set null,
  title text not null check (length(title) between 1 and 500),
  description text,
  kind text not null default 'task' check (kind in ('task', 'reply_requested')),
  due_at timestamptz,
  due_date_type public.date_type not null default 'none',
  due_timezone text,
  evidence text,
  status public.task_status not null default 'open',
  needs_confirmation boolean not null default false,
  confidence numeric(3, 2),
  reminder_at timestamptz,
  reminded_at timestamptz,
  completed_at timestamptz,
  created_by text not null default 'ai' check (created_by in ('ai', 'rules', 'user')),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tasks_user_status_due_idx on public.tasks (user_id, status, due_at);
create unique index tasks_dedupe_idx on public.tasks (user_id, source_message_id, lower(title)) where source_message_id is not null;

create table public.commitments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  source_message_id uuid references public.email_messages (id) on delete set null,
  source_thread_id uuid references public.email_threads (id) on delete set null,
  direction public.commitment_direction not null,
  counterparty text,
  description text not null check (length(description) between 1 and 1000),
  due_at timestamptz,
  due_date_type public.date_type not null default 'none',
  evidence text,
  status public.commitment_status not null default 'open',
  needs_confirmation boolean not null default false,
  confidence numeric(3, 2),
  created_by text not null default 'ai' check (created_by in ('ai', 'rules', 'user')),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index commitments_user_status_idx on public.commitments (user_id, status, due_at);
create unique index commitments_dedupe_idx on public.commitments (user_id, source_message_id, direction, lower(description)) where source_message_id is not null;

create table public.meetings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  message_id uuid not null references public.email_messages (id) on delete cascade,
  title text,
  start_at timestamptz,
  end_at timestamptz,
  timezone text,
  location text,
  conference_url text,
  participants jsonb not null default '[]',
  agenda text,
  requested_response text,
  source text not null check (source in ('ics', 'llm', 'rules')),
  status text not null default 'detected' check (status in ('detected', 'dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (message_id, source)
);
create index meetings_user_start_idx on public.meetings (user_id, start_at);

-- ---------------------------------------------------------------------------
-- Drafts, approvals, executions
-- ---------------------------------------------------------------------------
create table public.drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  account_id uuid not null references public.connected_accounts (id) on delete cascade,
  thread_id uuid references public.email_threads (id) on delete set null,
  reply_to_message_id uuid references public.email_messages (id) on delete set null,
  to_addresses text[] not null default '{}',
  cc_addresses text[] not null default '{}',
  subject text not null default '',
  body text not null default '',
  tone text not null default 'professional',
  custom_tone text,
  status public.draft_status not null default 'draft',
  source text not null default 'ai' check (source in ('ai', 'user')),
  model text,
  current_version_no integer not null default 1,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index drafts_user_updated_idx on public.drafts (user_id, updated_at desc);

create table public.draft_versions (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.drafts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  version_no integer not null,
  subject text not null,
  body text not null,
  tone text not null,
  source text not null check (source in ('ai', 'user')),
  model text,
  created_at timestamptz not null default now(),
  unique (draft_id, version_no)
);

create table public.action_approvals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  account_id uuid not null references public.connected_accounts (id) on delete cascade,
  action_type public.action_type not null,
  source_message_id uuid references public.email_messages (id) on delete set null,
  source_thread_id uuid references public.email_threads (id) on delete set null,
  draft_id uuid references public.drafts (id) on delete set null,
  params jsonb not null,
  params_hash text not null,
  explanation text not null,
  proposed_by text not null default 'user' check (proposed_by in ('user', 'ai', 'rules')),
  state public.approval_state not null default 'PENDING_APPROVAL',
  expires_at timestamptz not null,
  approved_by uuid references public.profiles (id),
  approved_at timestamptz,
  decided_at timestamptz,
  decision_reason text,
  idempotency_key text not null unique,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index action_approvals_user_state_idx on public.action_approvals (user_id, state, created_at desc);
create index action_approvals_draft_idx on public.action_approvals (draft_id) where draft_id is not null;

create table public.action_executions (
  id uuid primary key default gen_random_uuid(),
  approval_id uuid not null unique references public.action_approvals (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  state text not null check (state in ('executing', 'succeeded', 'failed')),
  attempt_count integer not null default 1,
  rfc822_message_id text,
  gmail_message_id text,
  result jsonb not null default '{}',
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Search, feedback, briefings, notifications
-- ---------------------------------------------------------------------------
create table public.search_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  message_id uuid not null references public.email_messages (id) on delete cascade,
  attachment_id uuid references public.email_attachments (id) on delete cascade,
  title text not null default '',
  content text not null default '',
  tsv tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', left(coalesce(content, ''), 200000)), 'B')
  ) stored,
  embedding extensions.vector,
  embedding_model text,
  updated_at timestamptz not null default now(),
  unique nulls not distinct (message_id, attachment_id)
);
create index search_documents_tsv_idx on public.search_documents using gin (tsv);
create index search_documents_user_idx on public.search_documents (user_id);

create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  message_id uuid references public.email_messages (id) on delete set null,
  kind text not null check (kind in ('priority_override', 'task_correction', 'summary_rating', 'risk_correction')),
  previous_value jsonb,
  new_value jsonb,
  comment text,
  created_at timestamptz not null default now()
);
create index feedback_user_idx on public.feedback (user_id, created_at desc);

create table public.briefing_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  briefing_date date not null,
  status text not null default 'succeeded' check (status in ('running', 'succeeded', 'failed')),
  source public.analysis_source not null default 'rules',
  content jsonb not null default '{}',
  narrative text,
  error text,
  created_at timestamptz not null default now(),
  unique (user_id, briefing_date)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('reminder', 'briefing', 'sync', 'approval', 'system')),
  title text not null,
  body text,
  link text,
  dedupe_key text,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, dedupe_key)
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Operations: jobs, LLM metrics, audit
-- ---------------------------------------------------------------------------
create table public.jobs (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles (id) on delete cascade,
  job_type text not null,
  payload jsonb not null default '{}',
  dedupe_key text,
  status public.job_status not null default 'queued',
  priority integer not null default 100,
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  run_at timestamptz not null default now(),
  locked_by text,
  locked_until timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);
-- Only one live job per (type, dedupe key): prevents duplicate work.
create unique index jobs_dedupe_live_idx on public.jobs (job_type, dedupe_key)
  where dedupe_key is not null and status in ('queued', 'running');
create index jobs_ready_idx on public.jobs (priority, run_at) where status = 'queued';
create index jobs_running_lease_idx on public.jobs (locked_until) where status = 'running';
create index jobs_user_idx on public.jobs (user_id, created_at desc);

create table public.llm_calls (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles (id) on delete cascade,
  request_id text not null,
  task text not null,
  model text,
  status text not null check (status in ('ok', 'invalid_output', 'timeout', 'unavailable', 'error', 'rejected')),
  latency_ms integer,
  input_chars integer,
  output_chars integer,
  attempts integer not null default 1,
  error_code text,
  created_at timestamptz not null default now()
);
create index llm_calls_user_created_idx on public.llm_calls (user_id, created_at desc);
create index llm_calls_created_idx on public.llm_calls (created_at desc);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles (id) on delete cascade,
  actor text not null check (actor in ('user', 'system', 'worker')),
  event text not null,
  entity_type text,
  entity_id text,
  details jsonb not null default '{}',
  request_id text,
  created_at timestamptz not null default now()
);
create index audit_logs_user_idx on public.audit_logs (user_id, created_at desc);
