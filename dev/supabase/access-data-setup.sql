-- Apply after customer-access-setup.sql and household-email-setup.sql.
begin;
-- Export access and delivery records without activation codes or token hashes.
create or replace function public.export_my_access_records() returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller uuid:=public.require_active_homeboard_account(); caller_email text;
begin
  select lower(btrim(u.email)) into caller_email from auth.users u where u.id=caller;
  return jsonb_build_object(
    'household_access',coalesce((select jsonb_agg(to_jsonb(a)) from public.household_access a join public.household_members m on m.household_id=a.household_id where m.user_id=caller),'[]'::jsonb),
    'passes',coalesce((select jsonb_agg(to_jsonb(p)-'token_hash') from public.household_access_passes p where p.recipient_user_id=caller or p.email=caller_email),'[]'::jsonb),
    'email_requests',coalesce((select jsonb_agg(to_jsonb(r)-'request_key') from public.homeboard_email_requests r where r.user_id=caller),'[]'::jsonb)
  );
end $$;
revoke all on function public.export_my_access_records() from public,anon,authenticated;
grant execute on function public.export_my_access_records() to authenticated;

create or replace function public.list_platform_household_access() returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller uuid:=public.require_active_homeboard_account(); result jsonb;
begin
  if not public.is_platform_admin() then raise exception 'Platform administrator access is required'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('household_id',a.household_id,'expires_at',a.expires_at,
    'renewal_requested',exists(select 1 from public.homeboard_email_requests r where r.household_id=a.household_id and r.operation='request-renewal'
      and r.created_at>coalesce((select max(p.created_at) from public.household_access_passes p where p.household_id=a.household_id and p.source='approved'),'-infinity'::timestamptz)))),'[]'::jsonb)
    into result from public.household_access a;
  return result;
end $$;
revoke all on function public.list_platform_household_access() from public,anon,authenticated;
grant execute on function public.list_platform_household_access() to authenticated;

create or replace function public.clean_up_deleted_homeboard_passes() returns trigger
language plpgsql security definer set search_path='' as $$ begin
  delete from public.household_access_passes p where p.recipient_user_id=old.id or p.email=lower(btrim(old.email));
  return old;
end $$;
drop trigger if exists clean_up_deleted_homeboard_passes on auth.users;
create trigger clean_up_deleted_homeboard_passes before delete on auth.users for each row execute function public.clean_up_deleted_homeboard_passes();
revoke all on function public.clean_up_deleted_homeboard_passes() from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
