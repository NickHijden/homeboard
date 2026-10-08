-- Homeboard Phase 3 invitation functions
--
-- Run this after households-setup.sql. Apply it in Development first; after
-- review and a current backup, it can also be applied to the Homeboard
-- production project. These functions are the only supported client path for
-- invitation creation, revocation, and acceptance.

-- Supabase installs pgcrypto helpers in the extensions schema. Qualify the
-- helpers so SECURITY DEFINER functions do not depend on a caller search path.

create or replace function public.list_my_households()
returns table (
  household_id uuid,
  household_name text,
  role text,
  member_count integer
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    h.id,
    h.name,
    m.role,
    (select count(*)::integer from public.household_members all_members where all_members.household_id = h.id)
  from public.households h
  join public.household_members m on m.household_id = h.id
  where m.user_id = (select auth.uid())
  order by h.created_at;
$$;

-- Platform administrators are explicitly allowlisted here. After applying
-- this migration, add the system owner's auth user in SQL, for example:
-- insert into public.platform_admins (user_id)
-- select id from auth.users where lower(email) = lower('owner@example.com')
-- on conflict (user_id) do nothing;
create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.platform_admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references auth.users(id) on delete restrict,
  action text not null check (action in ('delete_household')),
  household_id uuid not null,
  household_name text not null,
  created_at timestamptz not null default now()
);

alter table public.platform_admins enable row level security;
alter table public.platform_admin_audit_log enable row level security;
revoke all on table public.platform_admins from anon, authenticated;
revoke all on table public.platform_admin_audit_log from anon, authenticated;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.platform_admins
    where user_id = (select auth.uid())
  );
$$;

create or replace function public.list_platform_households()
returns table (
  household_id uuid,
  household_name text,
  member_count integer,
  created_at timestamptz,
  updated_at timestamptz,
  document_updated_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    h.id,
    h.name,
    count(m.user_id)::integer,
    h.created_at,
    h.updated_at,
    d.updated_at
  from public.households h
  left join public.household_members m on m.household_id = h.id
  left join public.household_documents d on d.household_id = h.id
  where public.is_platform_admin()
  group by h.id, h.name, h.created_at, h.updated_at, d.updated_at
  order by h.created_at desc;
$$;

create or replace function public.delete_household_for_admin(target_household_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller_id uuid := (select auth.uid());
  target_name text;
begin
  if caller_id is null or not public.is_platform_admin() then
    raise exception 'Platform administrator access is required';
  end if;

  select name into target_name
  from public.households
  where id = target_household_id;

  if target_name is null then
    raise exception 'That household no longer exists';
  end if;

  insert into public.platform_admin_audit_log (admin_user_id, action, household_id, household_name)
  values (caller_id, 'delete_household', target_household_id, target_name);

  delete from public.households
  where id = target_household_id;

  return true;
end;
$$;

create or replace function public.create_household_invitation(
  target_household_id uuid,
  target_email text,
  ttl_hours integer default 168
)
returns table (
  invitation_id uuid,
  invited_email text,
  expires_at timestamptz,
  token text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller_id uuid := (select auth.uid());
  clean_email text := lower(btrim(target_email));
  raw_token text;
  new_invitation_id uuid;
  invitation_expiry timestamptz;
begin
  if caller_id is null then
    raise exception 'Authentication is required';
  end if;

  if not public.is_household_owner(target_household_id) then
    raise exception 'Only a household owner can invite a partner';
  end if;

  if position('@' in clean_email) < 2 or position('.' in split_part(clean_email, '@', 2)) < 2 then
    raise exception 'Enter a valid email address';
  end if;

  if ttl_hours is null or ttl_hours < 1 or ttl_hours > 720 then
    raise exception 'Invitation expiry must be between 1 and 720 hours';
  end if;

  raw_token := encode(extensions.gen_random_bytes(32), 'hex');
  invitation_expiry := now() + make_interval(hours => ttl_hours);

  insert into public.household_invitations (
    household_id,
    invited_email,
    invited_by,
    token_hash,
    expires_at
  )
  values (
    target_household_id,
    clean_email,
    caller_id,
    encode(extensions.digest(raw_token, 'sha256'), 'hex'),
    invitation_expiry
  )
  returning id into new_invitation_id;

  return query select new_invitation_id, clean_email, invitation_expiry, raw_token;
end;
$$;

create or replace function public.list_household_invitations(target_household_id uuid)
returns table (
  invitation_id uuid,
  invited_email text,
  expires_at timestamptz,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    i.id,
    i.invited_email,
    i.expires_at,
    i.accepted_at,
    i.revoked_at,
    i.created_at
  from public.household_invitations i
  where i.household_id = target_household_id
    and public.is_household_owner(target_household_id)
  order by i.created_at desc;
$$;

create or replace function public.list_household_members(target_household_id uuid)
returns table (
  user_id uuid,
  email text,
  role text,
  joined_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    m.user_id,
    u.email,
    m.role,
    m.created_at
  from public.household_members m
  join auth.users u on u.id = m.user_id
  where m.household_id = target_household_id
    and public.is_household_member(target_household_id)
  order by case when m.role = 'owner' then 0 else 1 end, m.created_at;
$$;

create or replace function public.rename_household(
  target_household_id uuid,
  new_name text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  clean_name text := btrim(new_name);
begin
  if not public.is_household_owner(target_household_id) then
    raise exception 'Only the household owner can rename this household';
  end if;

  if char_length(clean_name) not between 1 and 120 then
    raise exception 'Household name must be between 1 and 120 characters';
  end if;

  update public.households
  set name = clean_name
  where id = target_household_id;

  return true;
end;
$$;

create or replace function public.remove_household_member(
  target_household_id uuid,
  target_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller_id uuid := (select auth.uid());
  target_role text;
begin
  if caller_id is null then
    raise exception 'Authentication is required';
  end if;

  if not public.is_household_owner(target_household_id) then
    raise exception 'Only a household owner can remove a member';
  end if;

  if target_user_id = caller_id then
    raise exception 'The owner cannot remove themselves';
  end if;

  select role into target_role
  from public.household_members
  where household_id = target_household_id
    and user_id = target_user_id;

  if target_role is null then
    raise exception 'That user is not a member of this household';
  end if;

  if target_role = 'owner' then
    raise exception 'The household owner cannot be removed';
  end if;

  delete from public.household_members
  where household_id = target_household_id
    and user_id = target_user_id;

  return true;
end;
$$;

create or replace function public.transfer_household_ownership(
  target_household_id uuid,
  target_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller_id uuid := (select auth.uid());
  target_role text;
begin
  if caller_id is null then
    raise exception 'Authentication is required';
  end if;

  if not public.is_household_owner(target_household_id) then
    raise exception 'Only the household owner can transfer ownership';
  end if;

  if target_user_id = caller_id then
    raise exception 'You are already the household owner';
  end if;

  select role into target_role
  from public.household_members
  where household_id = target_household_id
    and user_id = target_user_id;

  if target_role is null then
    raise exception 'That user is not a member of this household';
  end if;

  if target_role <> 'member' then
    raise exception 'Ownership can only be transferred to a regular member';
  end if;

  update public.household_members
  set role = 'member'
  where household_id = target_household_id
    and user_id = caller_id;

  update public.household_members
  set role = 'owner'
  where household_id = target_household_id
    and user_id = target_user_id;

  return true;
end;
$$;

create or replace function public.leave_household(target_household_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller_id uuid := (select auth.uid());
  caller_role text;
begin
  if caller_id is null then
    raise exception 'Authentication is required';
  end if;

  select role into caller_role
  from public.household_members
  where household_id = target_household_id
    and user_id = caller_id;

  if caller_role is null then
    raise exception 'You are not a member of this household';
  end if;

  if caller_role = 'owner' then
    raise exception 'The owner cannot leave the household. Remove members first or delete the household account.';
  end if;

  delete from public.household_members
  where household_id = target_household_id
    and user_id = caller_id;

  return true;
end;
$$;

create or replace function public.revoke_household_invitation(target_invitation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  invitation_household_id uuid;
begin
  select household_id into invitation_household_id
  from public.household_invitations
  where id = target_invitation_id;

  if invitation_household_id is null or not public.is_household_owner(invitation_household_id) then
    raise exception 'Only a household owner can revoke this invitation';
  end if;

  update public.household_invitations
  set revoked_at = coalesce(revoked_at, now())
  where id = target_invitation_id
    and accepted_at is null;

  return true;
end;
$$;

create or replace function public.accept_household_invitation(raw_token text)
returns table (
  household_id uuid,
  household_name text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller_id uuid := (select auth.uid());
  caller_email text;
  email_confirmed_at timestamptz;
  invitation public.household_invitations%rowtype;
begin
  if caller_id is null then
    raise exception 'Authentication is required';
  end if;

  select lower(u.email), u.email_confirmed_at
  into caller_email, email_confirmed_at
  from auth.users u
  where u.id = caller_id;

  if caller_email is null or email_confirmed_at is null then
    raise exception 'Confirm your Homeboard email before accepting an invitation';
  end if;

  select * into invitation
  from public.household_invitations
  where token_hash = encode(extensions.digest(btrim(raw_token), 'sha256'), 'hex')
    and accepted_at is null
    and revoked_at is null
    and expires_at > now()
  for update;

  if not found then
    raise exception 'This invitation is expired, revoked, or already used';
  end if;

  if lower(btrim(invitation.invited_email)) <> caller_email then
    raise exception 'This invitation was issued for a different email address';
  end if;

  insert into public.household_members (household_id, user_id, role)
  values (invitation.household_id, caller_id, 'member')
  -- The RETURNS TABLE output variable household_id shadows the column name.
  on conflict on constraint household_members_pkey do nothing;

  update public.household_invitations
  set accepted_at = now(), accepted_by = caller_id
  where id = invitation.id;

  return query
    select h.id, h.name
    from public.households h
    where h.id = invitation.household_id;
end;
$$;

revoke all on function public.list_my_households() from public, anon, authenticated;
revoke all on function public.is_platform_admin() from public, anon, authenticated;
revoke all on function public.list_platform_households() from public, anon, authenticated;
revoke all on function public.delete_household_for_admin(uuid) from public, anon, authenticated;
revoke all on function public.create_household_invitation(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.list_household_invitations(uuid) from public, anon, authenticated;
revoke all on function public.list_household_members(uuid) from public, anon, authenticated;
revoke all on function public.rename_household(uuid, text) from public, anon, authenticated;
revoke all on function public.remove_household_member(uuid, uuid) from public, anon, authenticated;
revoke all on function public.transfer_household_ownership(uuid, uuid) from public, anon, authenticated;
revoke all on function public.leave_household(uuid) from public, anon, authenticated;
revoke all on function public.revoke_household_invitation(uuid) from public, anon, authenticated;
revoke all on function public.accept_household_invitation(text) from public, anon, authenticated;

grant execute on function public.list_my_households() to authenticated;
grant execute on function public.is_platform_admin() to authenticated;
grant execute on function public.list_platform_households() to authenticated;
grant execute on function public.delete_household_for_admin(uuid) to authenticated;
grant execute on function public.create_household_invitation(uuid, text, integer) to authenticated;
grant execute on function public.list_household_invitations(uuid) to authenticated;
grant execute on function public.list_household_members(uuid) to authenticated;
grant execute on function public.rename_household(uuid, text) to authenticated;
grant execute on function public.remove_household_member(uuid, uuid) to authenticated;
grant execute on function public.transfer_household_ownership(uuid, uuid) to authenticated;
grant execute on function public.leave_household(uuid) to authenticated;
grant execute on function public.revoke_household_invitation(uuid) to authenticated;
grant execute on function public.accept_household_invitation(text) to authenticated;
