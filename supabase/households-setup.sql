-- Homeboard Phase 3 foundation: household accounts and membership isolation
--
-- Safe additive migration for Homeboard Development and customer projects.
-- Run this in Development first. After review and a current backup, it can
-- be run in the Homeboard production project. It does not modify or delete
-- planner_documents or existing planner data.
--
-- This deliberately coexists with planner_documents. Existing local-first and
-- one-user cloud-sync data is not migrated or deleted by this script.

create extension if not exists pgcrypto;

create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create table if not exists public.household_invitations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  invited_email text not null check (char_length(btrim(invited_email)) between 3 and 320),
  invited_by uuid not null references auth.users(id) on delete restrict,
  token_hash text not null unique,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.household_documents (
  household_id uuid primary key references public.households(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists household_members_user_id_idx
  on public.household_members(user_id);

create index if not exists household_invitations_household_id_idx
  on public.household_invitations(household_id);

create index if not exists household_invitations_email_idx
  on public.household_invitations(lower(invited_email));

create or replace function public.set_household_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists households_set_updated_at on public.households;
create trigger households_set_updated_at
before update on public.households
for each row execute function public.set_household_updated_at();

drop trigger if exists household_documents_set_updated_at on public.household_documents;
create trigger household_documents_set_updated_at
before update on public.household_documents
for each row execute function public.set_household_updated_at();

create or replace function public.is_household_member(target_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.household_members
    where household_id = target_household_id
      and user_id = (select auth.uid())
  );
$$;

create or replace function public.is_household_owner(target_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.household_members
    where household_id = target_household_id
      and user_id = (select auth.uid())
      and role = 'owner'
  );
$$;

-- Household creation is atomic: the caller gets one household, one owner
-- membership, and one empty document or the whole operation fails.
create or replace function public.create_household(household_name text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_household_id uuid;
  caller_id uuid := (select auth.uid());
  clean_name text := btrim(household_name);
begin
  if caller_id is null then
    raise exception 'Authentication is required';
  end if;

  if char_length(clean_name) not between 1 and 120 then
    raise exception 'Household name must be between 1 and 120 characters';
  end if;

  insert into public.households (name, created_by)
  values (clean_name, caller_id)
  returning id into new_household_id;

  insert into public.household_members (household_id, user_id, role)
  values (new_household_id, caller_id, 'owner');

  insert into public.household_documents (household_id)
  values (new_household_id);

  return new_household_id;
end;
$$;

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.household_invitations enable row level security;
alter table public.household_documents enable row level security;

drop policy if exists "Members can read their households" on public.households;
create policy "Members can read their households"
  on public.households for select
  to authenticated
  using (public.is_household_member(id));

drop policy if exists "Owners can update their households" on public.households;
create policy "Owners can update their households"
  on public.households for update
  to authenticated
  using (public.is_household_owner(id))
  with check (public.is_household_owner(id));

drop policy if exists "Members can read household membership" on public.household_members;
create policy "Members can read household membership"
  on public.household_members for select
  to authenticated
  using (public.is_household_member(household_id));

drop policy if exists "Members can read household documents" on public.household_documents;
create policy "Members can read household documents"
  on public.household_documents for select
  to authenticated
  using (public.is_household_member(household_id));

drop policy if exists "Members can update household documents" on public.household_documents;
create policy "Members can update household documents"
  on public.household_documents for update
  to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

-- Do not grant direct membership or invitation writes. The invitation issue,
-- revoke, and accept operations will be narrow server-side functions that can
-- hash tokens, enforce expiry/single-use, and verify the recipient's email.
revoke all on table public.households from anon, authenticated;
revoke all on table public.household_members from anon, authenticated;
revoke all on table public.household_invitations from anon, authenticated;
revoke all on table public.household_documents from anon, authenticated;

grant select, update on table public.households to authenticated;
grant select on table public.household_members to authenticated;
grant select, update on table public.household_documents to authenticated;

revoke all on function public.is_household_member(uuid) from public, anon, authenticated;
revoke all on function public.is_household_owner(uuid) from public, anon, authenticated;
revoke all on function public.create_household(text) from public, anon, authenticated;

grant execute on function public.is_household_member(uuid) to authenticated;
grant execute on function public.is_household_owner(uuid) to authenticated;
grant execute on function public.create_household(text) to authenticated;
