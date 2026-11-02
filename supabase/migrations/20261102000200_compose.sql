-- Gmail-style compose: Bcc on drafts and fast recipient autocomplete.

alter table public.drafts add column if not exists bcc_addresses text[] not null default '{}';

-- Bcc is part of the approved content: changing it must invalidate outstanding approvals.
create or replace function public.drafts_invalidate_approvals() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.to_addresses is distinct from old.to_addresses)
     or (new.cc_addresses is distinct from old.cc_addresses)
     or (new.bcc_addresses is distinct from old.bcc_addresses)
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

create index if not exists contacts_email_trgm
  on public.contacts using gin (lower(email) extensions.gin_trgm_ops);
create index if not exists contacts_name_trgm
  on public.contacts using gin (lower(coalesce(display_name, '')) extensions.gin_trgm_ops);
