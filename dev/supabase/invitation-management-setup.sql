-- Homeboard Development: renewable invitation links and current-owner revocation.
-- Run AFTER household-invitations-setup.sql and account-data-setup.sql.
-- Installing this migration does not change existing invitations or planner data.
begin;

do $$ begin
  if to_regprocedure('public.require_active_homeboard_account()') is null then
    raise exception 'Install account-data-setup.sql before invitation-management-setup.sql';
  end if;
end $$;

-- Internal helper only. Serialize owner actions with deletion and recheck the
-- owner's locked membership, including a concurrent ownership transfer.
create or replace function public.require_invitation_household_owner(target_household_id uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  caller_id uuid := public.require_active_homeboard_account();
  caller_household_role text;
begin
  -- NO KEY UPDATE is compatible with the FK lock taken by a joining member.
  perform h.id from public.households h where h.id = target_household_id for no key update;
  select m.role into caller_household_role from public.household_members m
    where m.household_id = target_household_id and m.user_id = caller_id for update;
  if caller_household_role is distinct from 'owner' then
    raise exception 'Only the current household owner can manage this invitation';
  end if;
  return caller_id;
end;
$$;
revoke all on function public.require_invitation_household_owner(uuid) from public, anon, authenticated;

create or replace function public.renew_household_invitation(target_invitation_id uuid)
returns table (invitation_id uuid, invited_email text, expires_at timestamptz, token text)
language plpgsql security definer set search_path = ''
as $$
declare
  target_household uuid;
  caller_id uuid;
  invitation public.household_invitations%rowtype;
  new_token text;
  new_expiry timestamptz;
begin
  select i.household_id into target_household from public.household_invitations i where i.id = target_invitation_id;
  caller_id := public.require_invitation_household_owner(target_household);
  select i.* into invitation from public.household_invitations i where i.id = target_invitation_id for update;
  if not found then raise exception 'This invitation is no longer available'; end if;
  if invitation.accepted_at is not null then raise exception 'This invitation has already been accepted'; end if;
  if invitation.revoked_at is not null then raise exception 'This invitation was revoked. Create a new invitation instead'; end if;
  if exists (select 1 from public.household_members m join auth.users u on u.id = m.user_id
    where m.household_id = target_household and lower(btrim(u.email)) = lower(btrim(invitation.invited_email))) then
    raise exception 'This person is already a household member';
  end if;
  new_token := encode(extensions.gen_random_bytes(32), 'hex');
  new_expiry := now() + interval '7 days';
  update public.household_invitations i
    set token_hash = encode(extensions.digest(new_token, 'sha256'), 'hex'), expires_at = new_expiry, invited_by = caller_id
    where i.id = target_invitation_id;
  return query select invitation.id, invitation.invited_email, new_expiry, new_token;
end;
$$;

create or replace function public.revoke_household_invitation(target_invitation_id uuid)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  target_household uuid;
  invitation public.household_invitations%rowtype;
begin
  select i.household_id into target_household from public.household_invitations i where i.id = target_invitation_id;
  perform public.require_invitation_household_owner(target_household);
  select i.* into invitation from public.household_invitations i where i.id = target_invitation_id for update;
  if not found then raise exception 'This invitation is no longer available'; end if;
  if invitation.accepted_at is not null then raise exception 'This invitation has already been accepted'; end if;
  update public.household_invitations i set revoked_at = coalesce(i.revoked_at, now()) where i.id = target_invitation_id;
  return true;
end;
$$;

revoke all on function public.renew_household_invitation(uuid) from public, anon, authenticated;
revoke all on function public.revoke_household_invitation(uuid) from public, anon, authenticated;
grant execute on function public.renew_household_invitation(uuid) to authenticated;
grant execute on function public.revoke_household_invitation(uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
