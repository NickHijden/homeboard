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
  on conflict (household_id, user_id) do nothing;

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
revoke all on function public.create_household_invitation(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.list_household_invitations(uuid) from public, anon, authenticated;
revoke all on function public.revoke_household_invitation(uuid) from public, anon, authenticated;
revoke all on function public.accept_household_invitation(text) from public, anon, authenticated;

grant execute on function public.list_my_households() to authenticated;
grant execute on function public.create_household_invitation(uuid, text, integer) to authenticated;
grant execute on function public.list_household_invitations(uuid) to authenticated;
grant execute on function public.revoke_household_invitation(uuid) to authenticated;
grant execute on function public.accept_household_invitation(text) to authenticated;
