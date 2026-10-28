-- MailPilot AI: triggers, invariants and maintenance functions.

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'user_settings', 'connected_accounts', 'oauth_credentials', 'sync_state',
    'gmail_labels', 'email_threads', 'email_messages', 'email_attachments', 'email_analysis',
    'thread_summaries', 'contacts', 'contact_preferences', 'tasks', 'commitments', 'meetings',
    'drafts', 'action_approvals', 'search_documents', 'jobs'
  ] loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      t || '_set_updated_at', t
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Provision profile + settings for every new Supabase Auth user
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  insert into public.user_settings (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Optimistic concurrency: bump version on every update of versioned rows.
-- Clients send the version they read; repositories update "where version = :v".
-- ---------------------------------------------------------------------------
create or replace function public.bump_version() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.version := old.version + 1;
  return new;
end;
$$;

create trigger user_settings_bump_version before update on public.user_settings
  for each row execute function public.bump_version();
create trigger tasks_bump_version before update on public.tasks
  for each row execute function public.bump_version();
create trigger commitments_bump_version before update on public.commitments
  for each row execute function public.bump_version();

-- ---------------------------------------------------------------------------
-- Drafts: any change to approved content invalidates outstanding approvals.
-- Enforced in the database so no code path (API, PostgREST, worker) can bypass it.
-- ---------------------------------------------------------------------------
create or replace function public.drafts_invalidate_approvals() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.to_addresses is distinct from old.to_addresses)
     or (new.cc_addresses is distinct from old.cc_addresses)
     or (new.subject is distinct from old.subject)
     or (new.body is distinct from old.body)
     or (new.thread_id is distinct from old.thread_id)
     or (new.reply_to_message_id is distinct from old.reply_to_message_id)
     or (new.account_id is distinct from old.account_id) then
    if old.status = 'sent' then
      raise exception 'sent drafts are immutable' using errcode = 'check_violation';
    end if;
    update public.action_approvals
       set state = 'CANCELLED',
           decided_at = now(),
           decision_reason = 'draft_modified'
     where draft_id = new.id
       and state in ('PROPOSED', 'PENDING_APPROVAL', 'APPROVED');
    if new.status in ('pending_approval', 'approved') then
      new.status := 'draft';
    end if;
    new.version := old.version + 1;
  end if;
  return new;
end;
$$;

create trigger drafts_invalidate_approvals before update on public.drafts
  for each row execute function public.drafts_invalidate_approvals();

-- ---------------------------------------------------------------------------
-- Approval state machine guard and immutability of approved parameters.
-- ---------------------------------------------------------------------------
create or replace function public.approval_transition_allowed(
  from_state public.approval_state, to_state public.approval_state
) returns boolean
language sql immutable set search_path = '' as $$
  select case from_state
    when 'PROPOSED' then to_state in ('PENDING_APPROVAL', 'REJECTED', 'EXPIRED', 'CANCELLED')
    when 'PENDING_APPROVAL' then to_state in ('APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED')
    when 'APPROVED' then to_state in ('EXECUTING', 'EXPIRED', 'CANCELLED')
    when 'EXECUTING' then to_state in ('SUCCEEDED', 'FAILED')
    when 'FAILED' then to_state in ('EXECUTING', 'CANCELLED')
    else false
  end;
$$;

create or replace function public.action_approvals_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.params is distinct from old.params
     or new.params_hash is distinct from old.params_hash
     or new.action_type is distinct from old.action_type
     or new.user_id is distinct from old.user_id
     or new.account_id is distinct from old.account_id
     or new.idempotency_key is distinct from old.idempotency_key then
    raise exception 'approval parameters are immutable' using errcode = 'check_violation';
  end if;
  if new.state is distinct from old.state then
    if not public.approval_transition_allowed(old.state, new.state) then
      raise exception 'illegal approval transition % -> %', old.state, new.state
        using errcode = 'check_violation';
    end if;
    if new.state = 'APPROVED' and (new.approved_by is null or new.approved_by <> new.user_id) then
      raise exception 'approval must be granted by the owning user' using errcode = 'check_violation';
    end if;
    new.version := old.version + 1;
  end if;
  return new;
end;
$$;

create trigger action_approvals_guard before update on public.action_approvals
  for each row execute function public.action_approvals_guard();

-- ---------------------------------------------------------------------------
-- Durable job queue (FOR UPDATE SKIP LOCKED). Expired leases from crashed
-- workers become claimable again.
-- ---------------------------------------------------------------------------
create or replace function public.claim_jobs(
  p_worker text, p_limit integer, p_lease_seconds integer, p_job_types text[] default null
) returns setof public.jobs
language plpgsql set search_path = '' as $$
begin
  return query
  with candidates as (
    select j.id
      from public.jobs j
     where ((j.status = 'queued' and j.run_at <= now())
        or (j.status = 'running' and j.locked_until < now()))
       and (p_job_types is null or j.job_type = any (p_job_types))
     order by j.priority, j.run_at
     limit p_limit
     for update skip locked
  )
  update public.jobs j
     set status = 'running',
         locked_by = p_worker,
         locked_until = now() + make_interval(secs => p_lease_seconds),
         attempts = j.attempts + 1
    from candidates c
   where j.id = c.id
  returning j.*;
end;
$$;

-- ---------------------------------------------------------------------------
-- Retention and cleanup
-- ---------------------------------------------------------------------------
create or replace function public.expire_stale_approvals() returns integer
language plpgsql set search_path = '' as $$
declare
  n integer;
begin
  update public.action_approvals
     set state = 'EXPIRED', decided_at = now(), decision_reason = 'expired'
   where state in ('PROPOSED', 'PENDING_APPROVAL', 'APPROVED')
     and expires_at < now();
  get diagnostics n = row_count;
  return n;
end;
$$;

create or replace function public.purge_expired_data() returns jsonb
language plpgsql set search_path = '' as $$
declare
  deleted_messages integer;
  deleted_states integer;
  deleted_jobs integer;
  deleted_llm integer;
  expired integer;
begin
  delete from public.email_messages m
   using public.user_settings s
   where s.user_id = m.user_id
     and m.internal_date < now() - make_interval(days => s.email_retention_days);
  get diagnostics deleted_messages = row_count;

  delete from public.email_threads t
   where not exists (select 1 from public.email_messages m where m.thread_id = t.id);

  delete from public.oauth_states where expires_at < now() - interval '1 day';
  get diagnostics deleted_states = row_count;

  delete from public.jobs
   where status in ('succeeded', 'dead', 'failed') and updated_at < now() - interval '14 days';
  get diagnostics deleted_jobs = row_count;

  delete from public.llm_calls where created_at < now() - interval '90 days';
  get diagnostics deleted_llm = row_count;

  expired := public.expire_stale_approvals();

  return jsonb_build_object(
    'deleted_messages', deleted_messages, 'deleted_oauth_states', deleted_states,
    'deleted_jobs', deleted_jobs, 'deleted_llm_calls', deleted_llm, 'expired_approvals', expired
  );
end;
$$;

revoke execute on function public.claim_jobs(text, integer, integer, text[]) from public, anon, authenticated;
revoke execute on function public.purge_expired_data() from public, anon, authenticated;
revoke execute on function public.expire_stale_approvals() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
