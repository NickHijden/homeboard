-- Existing-install repair for invitation acceptance. Run in the
-- Homeboard Development SQL Editor (project axfxuqihsscjekicbgkk).
-- Replaces only this function; keeps accounts, households and invitations.
-- Safe to run again. Requires household-invitations-setup.sql already installed.
begin;

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

revoke all on function public.accept_household_invitation(text) from public, anon, authenticated;
grant execute on function public.accept_household_invitation(text) to authenticated;

notify pgrst, 'reload schema';
commit;
