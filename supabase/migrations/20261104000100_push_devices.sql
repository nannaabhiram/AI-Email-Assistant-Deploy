-- Mobile push notifications (Firebase Cloud Messaging, free tier) and an 'important'
-- notification kind for high-stakes mail such as internship / job offers.

create table if not exists public.push_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  token text not null unique check (length(token) between 20 and 4096),
  platform text not null check (platform in ('android', 'ios')),
  device_name text,
  app_version text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  disabled_at timestamptz
);
create index if not exists push_devices_user_idx on public.push_devices (user_id) where disabled_at is null;

-- Written only by the trusted backend; never visible to user sessions.
alter table public.push_devices enable row level security;
revoke all on table public.push_devices from anon, authenticated;

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('reminder', 'briefing', 'sync', 'approval', 'system', 'important'));
