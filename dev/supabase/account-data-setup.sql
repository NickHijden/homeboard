-- Homeboard account export and deletion. Apply AFTER households-setup.sql and
-- household-invitations-setup.sql, in Development first. This migration does
-- not delete existing data. Deploy the delete-account Edge Function afterward.
begin;

-- A former creator must be able to leave a household with its new owner.
alter table public.households alter column created_by drop not null;
alter table public.households drop constraint if exists households_created_by_fkey;
alter table public.households add constraint households_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;
-- Retain administrative action history without retaining the deleted user ID.
alter table public.platform_admin_audit_log alter column admin_user_id drop not null;
alter table public.platform_admin_audit_log drop constraint if exists platform_admin_audit_log_admin_user_id_fkey;
alter table public.platform_admin_audit_log add constraint platform_admin_audit_log_admin_user_id_fkey
  foreign key (admin_user_id) references auth.users(id) on delete set null;

create or replace function public.require_active_homeboard_account()
returns uuid language plpgsql security definer set search_path = '' as $$
declare caller uuid := auth.uid();
begin
  -- Issued JWTs can outlive sign-out/deletion. Require a live server session.
  if caller is null or not exists (select 1 from auth.users where id = caller)
    or not exists (select 1 from auth.sessions where user_id = caller
      and id::text = auth.jwt()->>'session_id') then
    raise exception 'Sign in again to manage your account';
  end if;
  return caller;
end;
$$;
revoke all on function public.require_active_homeboard_account() from public, anon, authenticated;

create or replace function public.preview_my_account_deletion()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare caller uuid := public.require_active_homeboard_account();
begin
  return jsonb_build_object(
    'account_id', caller,
    'email', (select email from auth.users where id = caller),
    'platform_admin', exists(select 1 from public.platform_admins where user_id = caller),
    'households', coalesce((select jsonb_agg(jsonb_build_object(
      'id', h.id, 'name', h.name, 'role', m.role,
      'other_members', (select count(*) from public.household_members others
        where others.household_id = h.id and others.user_id <> caller)
    ) order by h.id) from public.households h join public.household_members m
      on m.household_id = h.id where m.user_id = caller), '[]'::jsonb)
  );
end;
$$;

create or replace function public.export_my_account_data()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := public.require_active_homeboard_account();
  account_email text;
  reminder_history jsonb := '[]'::jsonb;
begin
  select lower(email) into account_email from auth.users where id = caller;
  if to_regclass('public.homeboard_reminder_log') is not null then
    execute 'select coalesce(jsonb_agg(to_jsonb(r)), ''[]''::jsonb)
      from public.homeboard_reminder_log r where planner_id = $1'
      into reminder_history using caller;
  end if;
  return jsonb_build_object(
    'format', 'homeboard-account-export', 'version', 1, 'exported_at', now(),
    'account', (select jsonb_build_object('id', id, 'email', email, 'phone', phone,
      'created_at', created_at, 'updated_at', updated_at,
      'email_confirmed_at', email_confirmed_at, 'last_sign_in_at', last_sign_in_at,
      'profile_and_policy_acknowledgement', raw_user_meta_data)
      from auth.users where id = caller),
    'sign_in_providers', coalesce((select jsonb_agg(jsonb_build_object(
      'provider', provider, 'created_at', created_at, 'last_sign_in_at', last_sign_in_at))
      from auth.identities where user_id = caller), '[]'::jsonb),
    'private_planner', (select jsonb_build_object('data', data, 'updated_at', updated_at)
      from public.planner_documents where id = caller),
    'households', coalesce((select jsonb_agg(jsonb_build_object(
      'id', h.id, 'name', h.name, 'your_role', m.role, 'joined_at', m.created_at,
      'planner', d.data, 'planner_updated_at', d.updated_at) order by h.id)
      from public.households h join public.household_members m on m.household_id = h.id
      left join public.household_documents d on d.household_id = h.id
      where m.user_id = caller), '[]'::jsonb),
    'invitations', coalesce((select jsonb_agg(jsonb_build_object(
      'id', id, 'household_id', household_id, 'invited_email', invited_email,
      'sent_by_you', invited_by = caller, 'accepted_by_you', accepted_by = caller,
      'created_at', created_at, 'expires_at', expires_at,
      'accepted_at', accepted_at, 'revoked_at', revoked_at))
      from public.household_invitations
      where invited_by = caller or accepted_by = caller or lower(btrim(invited_email)) = account_email), '[]'::jsonb),
    'administrative_actions', coalesce((select jsonb_agg(jsonb_build_object(
      'action', action, 'household_id', household_id, 'household_name', household_name, 'created_at', created_at))
      from public.platform_admin_audit_log where admin_user_id = caller), '[]'::jsonb),
    'reminder_history', reminder_history,
    'scope', 'Account records and planner data currently accessible to you. Shared planners can contain other members’ entries. Provider security logs, infrastructure backups and previously downloaded files are not included. This file is not a planner restore backup.'
  );
end;
$$;

-- Store the preview the user actually confirmed. Only the Edge Function can
-- delete an auth user; this RPC alone never deletes anything.
create table if not exists public.account_deletion_intents (
  user_id uuid primary key references auth.users(id) on delete cascade,
  preview jsonb not null,
  expires_at timestamptz not null
);
alter table public.account_deletion_intents enable row level security;
revoke all on table public.account_deletion_intents from public, anon, authenticated;

create or replace function public.prepare_my_account_deletion(expected_preview jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
declare current_preview jsonb := public.preview_my_account_deletion();
begin
  if expected_preview is distinct from current_preview then
    raise exception 'Your household details changed. Review deletion again';
  end if;
  if (current_preview->>'platform_admin')::boolean then
    raise exception 'Another administrator must remove your platform administrator access first';
  end if;
  if exists (select 1 from jsonb_array_elements(current_preview->'households') h
    where h->>'role' = 'owner' and (h->>'other_members')::int > 0) then
    raise exception 'Transfer ownership of your shared households before deleting your account';
  end if;
  insert into public.account_deletion_intents(user_id, preview, expires_at)
    values (auth.uid(), current_preview, now() + interval '2 minutes')
    on conflict(user_id) do update set preview = excluded.preview, expires_at = excluded.expires_at;
  return true;
end;
$$;

create or replace function public.clean_up_deleted_homeboard_account()
returns trigger language plpgsql security definer set search_path = '' as $$
declare expected jsonb; current_households jsonb;
begin
  -- Serialize rare account deletions with membership changes (including
  -- invitation acceptance and ownership transfer). Any error rolls back the
  -- entire auth deletion, so cleanup cannot leave a half-deleted account.
  lock table public.household_members in share row exclusive mode;
  if exists(select 1 from public.platform_admins where user_id = old.id) then
    raise exception 'Remove platform administrator access before deleting this account';
  end if;
  if exists(select 1 from public.household_members m where m.user_id = old.id
    and m.role = 'owner' and exists(select 1 from public.household_members other
      where other.household_id = m.household_id and other.user_id <> old.id)) then
    raise exception 'Transfer ownership of shared households before deleting this account';
  end if;
  select preview into expected from public.account_deletion_intents
    where user_id = old.id and expires_at > now();
  -- Administrative dashboard deletion still obeys the ownership safeguards.
  -- An app deletion additionally checks its confirmed snapshot atomically.
  if exists(select 1 from public.account_deletion_intents where user_id = old.id) then
    select coalesce(jsonb_agg(jsonb_build_object('id', h.id, 'name', h.name,
      'role', m.role, 'other_members', (select count(*) from public.household_members others
        where others.household_id = h.id and others.user_id <> old.id)) order by h.id), '[]'::jsonb)
      into current_households from public.households h join public.household_members m
      on m.household_id = h.id where m.user_id = old.id;
    if expected is null or expected->'households' is distinct from current_households then
      raise exception 'Deletion preview expired or changed. Review deletion again';
    end if;
  end if;
  delete from public.household_invitations where invited_by = old.id
    or accepted_by = old.id or lower(btrim(invited_email)) = lower(old.email);
  delete from public.households where id in (
    select household_id from public.household_members where user_id = old.id and role = 'owner');
  -- Remaining membership, private planner, reminder and auth rows cascade;
  -- shared planners stay with their remaining members.
  return old;
end;
$$;
revoke all on function public.clean_up_deleted_homeboard_account() from public, anon, authenticated;
drop trigger if exists homeboard_before_account_delete on auth.users;
create trigger homeboard_before_account_delete before delete on auth.users
  for each row execute function public.clean_up_deleted_homeboard_account();

revoke all on function public.preview_my_account_deletion() from public, anon, authenticated;
revoke all on function public.export_my_account_data() from public, anon, authenticated;
revoke all on function public.prepare_my_account_deletion(jsonb) from public, anon, authenticated;
grant execute on function public.preview_my_account_deletion() to authenticated;
grant execute on function public.export_my_account_data() to authenticated;
grant execute on function public.prepare_my_account_deletion(jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
