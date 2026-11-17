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
