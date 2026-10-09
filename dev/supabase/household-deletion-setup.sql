-- Homeboard Development: install after account-data-setup.sql.
-- Adds an owner-only operation; does not delete any existing data when installed.
begin;

create or replace function public.delete_my_household(
  target_household_id uuid,
  confirmed_household_name text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := public.require_active_homeboard_account();
  current_name text;
  caller_household_role text;
begin
  -- Lock the household and then the caller's membership. A concurrent rename
  -- or ownership transfer must finish before confirmation/ownership is checked.
  select h.name into current_name
  from public.households h
  where h.id = target_household_id
  for update;

  select m.role into caller_household_role
  from public.household_members m
  where m.household_id = target_household_id and m.user_id = caller
  for update;

  if caller_household_role is distinct from 'owner' then
    raise exception 'Only the current household owner can delete this household.';
  end if;
  if confirmed_household_name is distinct from current_name then
    raise exception 'The household name does not match. Close this dialog, refresh Household settings and try again.';
  end if;

  -- Existing foreign keys atomically remove the shared document, invitations
  -- and memberships. Auth users, private planners and other households remain.
  delete from public.households h where h.id = target_household_id;
  return true;
end;
$$;

revoke all on function public.delete_my_household(uuid, text) from public, anon, authenticated;
grant execute on function public.delete_my_household(uuid, text) to authenticated;
notify pgrst, 'reload schema';
commit;
