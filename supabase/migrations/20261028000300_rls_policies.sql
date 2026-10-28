-- MailPilot AI: Row Level Security.
--
-- Model:
--   * anon has no access to any application table.
--   * authenticated users can read only rows they own (user_id = auth.uid()).
--   * Users may directly edit only low-risk personal data (settings, tasks,
--     commitments, contacts, notifications). Approvals, executions, OAuth material,
--     mail content and audit logs are written exclusively by the trusted backend.
--   * The backend's privileged connection bypasses RLS and therefore always scopes
--     queries by the verified user id; user-scoped reads additionally run under
--     the authenticated role so these policies act as a second line of defence.

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'user_settings', 'connected_accounts', 'oauth_credentials', 'oauth_states',
    'sync_state', 'gmail_labels', 'email_threads', 'email_messages', 'email_attachments',
    'email_analysis', 'thread_summaries', 'contacts', 'contact_preferences', 'tasks',
    'commitments', 'meetings', 'drafts', 'draft_versions', 'action_approvals',
    'action_executions', 'search_documents', 'feedback', 'briefing_runs', 'notifications',
    'jobs', 'llm_calls', 'audit_logs'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon', t);
  end loop;
end;
$$;

-- OAuth material is never readable by user sessions, even their own.
revoke all on table public.oauth_credentials from authenticated;
revoke all on table public.oauth_states from authenticated;

-- Read-only (for user sessions) tables: select own rows.
do $$
declare
  t text;
begin
  foreach t in array array[
    'user_settings', 'connected_accounts', 'sync_state', 'gmail_labels', 'email_threads',
    'email_messages', 'email_attachments', 'email_analysis', 'thread_summaries', 'contacts',
    'contact_preferences', 'tasks', 'commitments', 'meetings', 'drafts', 'draft_versions',
    'action_approvals', 'action_executions', 'search_documents', 'feedback', 'briefing_runs',
    'notifications', 'jobs', 'llm_calls', 'audit_logs'
  ] loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))',
      t || '_select_own', t
    );
  end loop;
end;
$$;

create policy profiles_select_own on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy profiles_update_own on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy user_settings_update_own on public.user_settings
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Tasks and commitments: full CRUD on own rows; linked sources must also be owned.
create policy tasks_insert_own on public.tasks for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (source_message_id is null or exists (select 1 from public.email_messages m where m.id = source_message_id))
  );
create policy tasks_update_own on public.tasks for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (source_message_id is null or exists (select 1 from public.email_messages m where m.id = source_message_id))
  );
create policy tasks_delete_own on public.tasks for delete to authenticated
  using (user_id = (select auth.uid()));

create policy commitments_insert_own on public.commitments for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (source_message_id is null or exists (select 1 from public.email_messages m where m.id = source_message_id))
  );
create policy commitments_update_own on public.commitments for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (source_message_id is null or exists (select 1 from public.email_messages m where m.id = source_message_id))
  );
create policy commitments_delete_own on public.commitments for delete to authenticated
  using (user_id = (select auth.uid()));

create policy contacts_insert_own on public.contacts for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy contacts_update_own on public.contacts for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy contacts_delete_own on public.contacts for delete to authenticated
  using (user_id = (select auth.uid()));

create policy contact_preferences_insert_own on public.contact_preferences for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.contacts c where c.id = contact_id)
  );
create policy contact_preferences_update_own on public.contact_preferences for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy contact_preferences_delete_own on public.contact_preferences for delete to authenticated
  using (user_id = (select auth.uid()));

create policy notifications_update_own on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy feedback_insert_own on public.feedback for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (message_id is null or exists (select 1 from public.email_messages m where m.id = message_id))
  );

create policy meetings_update_own on public.meetings for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Users may edit draft text directly; the drafts_invalidate_approvals trigger cancels
-- any approval of the previous content. Account and thread links must stay owned.
create policy drafts_update_own on public.drafts for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.connected_accounts a where a.id = account_id)
  );

-- Column-level hardening: user sessions may not rewrite ownership or system fields.
revoke update on table public.drafts from authenticated;
grant update (to_addresses, cc_addresses, subject, body, tone, custom_tone) on table public.drafts to authenticated;
revoke update on table public.tasks from authenticated;
grant update (title, description, due_at, due_date_type, due_timezone, status, needs_confirmation, reminder_at, completed_at)
  on table public.tasks to authenticated;
revoke update on table public.commitments from authenticated;
grant update (description, counterparty, due_at, due_date_type, status, needs_confirmation)
  on table public.commitments to authenticated;
revoke update on table public.notifications from authenticated;
grant update (read_at) on table public.notifications to authenticated;
revoke update on table public.meetings from authenticated;
grant update (status) on table public.meetings to authenticated;
revoke update on table public.contacts from authenticated;
grant update (display_name, is_vip, importance, notes, relationship_summary) on table public.contacts to authenticated;
revoke update on table public.user_settings from authenticated;
grant update (
  timezone, briefing_enabled, briefing_time, notification_prefs, priority_thresholds, scoring_weights,
  review_confidence_threshold, auto_analyze, attachment_auto_extract, attachment_max_bytes,
  store_attachments, email_retention_days, sync_lookback_days, sync_max_messages,
  default_reply_tone, newsletter_digest
) on table public.user_settings to authenticated;
revoke update on table public.profiles from authenticated;
grant update (display_name) on table public.profiles to authenticated;

-- Tables with no write policies for authenticated also lose write grants entirely.
do $$
declare
  t text;
begin
  foreach t in array array[
    'connected_accounts', 'sync_state', 'gmail_labels', 'email_threads', 'email_messages',
    'email_attachments', 'email_analysis', 'thread_summaries', 'draft_versions',
    'action_approvals', 'action_executions', 'search_documents', 'briefing_runs', 'jobs',
    'llm_calls', 'audit_logs'
  ] loop
    execute format('revoke insert, update, delete, truncate on table public.%I from authenticated', t);
  end loop;
end;
$$;
revoke insert, delete, truncate on table public.drafts from authenticated;
revoke insert, delete, truncate on table public.meetings from authenticated;
revoke insert, delete, truncate on table public.notifications from authenticated;
revoke insert, delete, truncate on table public.profiles from authenticated;
revoke insert, delete, truncate on table public.user_settings from authenticated;
revoke update, delete, truncate on table public.feedback from authenticated;
