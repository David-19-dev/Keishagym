-- KeishaGym — the AI Coach, rebuilt on Supabase.
--
-- Why the proposal lives here and not in the synced state document: a device pushes its whole
-- state and the newest one wins. A proposal written into that document would be erased without
-- trace by the next device to sync an older copy. So it lives in a row only the Edge Function
-- writes, until the profile decides what to do with it — at which point the *client* applies
-- the accepted changes to the plan, and the outcome joins the synced log, which is where an
-- audit trail belongs.
--
-- The function writes with the service role, so no write policy is granted to anyone: a
-- profile can read its own row and nothing else. Consent is the one field the app owns, and
-- it travels in the state document as before.

create table if not exists public.coach_profile (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  -- { daily: {d, plans, reviews}, current: {...}|null, pending: {...}|null, history: [...] }
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint coach_profile_size check (pg_column_size(data) < 2 * 1024 * 1024)
);

comment on table public.coach_profile is
  'KeishaGym: per-profile Coach state — running job, pending proposal, decision history. Written by the coach Edge Function only.';

create or replace function public.coach_profile_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists coach_profile_touch on public.coach_profile;
create trigger coach_profile_touch
  before insert or update on public.coach_profile
  for each row execute function public.coach_profile_touch();

alter table public.coach_profile enable row level security;

revoke all on public.coach_profile from anon;
grant select on public.coach_profile to authenticated;

drop policy if exists "coach_profile: read own" on public.coach_profile;
create policy "coach_profile: read own" on public.coach_profile
  for select to authenticated using ((select auth.uid()) = user_id);
