-- Run in BOTH projects before enabling the matching signup schedule.
-- Tracks new Auth users from installation onwards; existing users are not emailed.
-- Does not change the signup transaction or install an auth.users trigger.
begin;
create table if not exists public.homeboard_signup_notification_settings (
 singleton boolean primary key default true check (singleton),
 enabled_at timestamptz not null default now()
);
insert into public.homeboard_signup_notification_settings(singleton) values(true) on conflict do nothing;
alter table public.homeboard_signup_notification_settings enable row level security;
revoke all on public.homeboard_signup_notification_settings from public,anon,authenticated;
grant select on public.homeboard_signup_notification_settings to service_role;
create table if not exists public.homeboard_signup_notifications (
 user_id uuid primary key references auth.users(id) on delete cascade,
 status text not null default 'reserved' check (status in ('reserved','accepted','failed','unknown')),
 created_at timestamptz not null default now(),
 provider_status integer
);
alter table public.homeboard_signup_notifications enable row level security;
revoke all on public.homeboard_signup_notifications from public,anon,authenticated;
grant select,update on public.homeboard_signup_notifications to service_role;
create or replace function public.claim_homeboard_signup_notification()
returns jsonb language plpgsql security definer set search_path='' as $$
declare candidate record;
begin
 -- Serialize claims without changing or locking the Auth signup flow.
 if not pg_catalog.pg_try_advisory_xact_lock(761916381::bigint) then return null; end if;
 select u.id,u.email,u.created_at,u.email_confirmed_at into candidate
 from auth.users u
 where u.created_at >= (select s.enabled_at from public.homeboard_signup_notification_settings s where s.singleton)
 and nullif(u.email,'') is not null
 and not exists(select 1 from public.homeboard_signup_notifications n where n.user_id=u.id)
 order by u.created_at,u.id limit 1;
 if not found then return null; end if;
 insert into public.homeboard_signup_notifications(user_id) values(candidate.id);
 return jsonb_build_object('id',candidate.id,'email',candidate.email,'created_at',candidate.created_at,'confirmed',candidate.email_confirmed_at is not null);
end;
$$;
revoke all on function public.claim_homeboard_signup_notification() from public,anon,authenticated;
grant execute on function public.claim_homeboard_signup_notification() to service_role;
notify pgrst,'reload schema';
commit;

-- PRODUCTION: yflzmwriknvxhwhaetuk
-- Deploy signup-notifications first; Verify JWT OFF, handler secret stays required.
-- Uses the existing HOMEBOARD_WEEKLY_CRON_SECRET and matching Vault secret.
begin;
create extension if not exists pg_cron;
create extension if not exists pg_net;
do $$ begin
 if not exists(select 1 from vault.secrets where name='homeboard_weekly_cron_secret') then
  raise exception 'Create the weekly secret and configure the Edge Function first';
 end if;
end $$;
select cron.schedule('homeboard-signup-notifications','*/5 * * * *',$job$
 select net.http_post(
  url:='https://yflzmwriknvxhwhaetuk.supabase.co/functions/v1/signup-notifications',
  headers:=jsonb_build_object('Content-Type','application/json','x-homeboard-cron-secret',
    (select decrypted_secret from vault.decrypted_secrets where name='homeboard_weekly_cron_secret')),
  body:='{}'::jsonb
 );
$job$);
commit;
select jobname,schedule,active from cron.job where jobname='homeboard-signup-notifications';
