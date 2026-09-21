-- KeishaGym — step 1: one synced state document per account.
--
-- The app keeps its whole state (plan, workouts, weigh-ins, settings) as one JSON document on
-- the device and syncs it as a unit, exactly as the old self-hosted server did. This table is
-- that document's home. Row-level security is the whole access model: the browser talks to
-- PostgREST with the public anon key, so every rule lives here, not in the app.
--
-- Step 2 (before public launch) splits the document into real tables; this one then becomes
-- the migration source.

create table if not exists public.user_state (
  user_id    uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  state      jsonb not null,
  updated_at timestamptz not null default now(),
  -- a runaway client must not be able to fill the disk: years of training are well under 5 MB
  constraint user_state_size check (pg_column_size(state) < 5 * 1024 * 1024)
);

comment on table public.user_state is 'KeishaGym: one synced app-state document per account (owner-only via RLS).';

-- updated_at is the server's clock, whatever the client sends
create or replace function public.user_state_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists user_state_touch on public.user_state;
create trigger user_state_touch
  before insert or update on public.user_state
  for each row execute function public.user_state_touch();

-- ---------------------------------------------------------------- access --
alter table public.user_state enable row level security;

revoke all on public.user_state from anon;
grant select, insert, update, delete on public.user_state to authenticated;

drop policy if exists "user_state: read own" on public.user_state;
create policy "user_state: read own" on public.user_state
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "user_state: create own" on public.user_state;
create policy "user_state: create own" on public.user_state
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "user_state: update own" on public.user_state;
create policy "user_state: update own" on public.user_state
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "user_state: delete own" on public.user_state;
create policy "user_state: delete own" on public.user_state
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ------------------------------------------------------- account deletion --
-- App Store guideline 5.1.1(v): an app that lets people create an account must let them
-- delete it from inside the app. Deleting the auth user cascades to user_state.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  delete from auth.users where id = uid;
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
