-- PRODUCTION ONLY: yflzmwriknvxhwhaetuk
-- Install weekly-summary-setup.sql, deploy weekly-summary, and configure its
-- HOMEBOARD_WEEKLY_CRON_SECRET from weekly-summary-secret.sql BEFORE running this.
-- Invokes every 15 minutes on Mondays. The handler gates 09:00 Europe/Amsterdam
-- and records one attempt per household/member/week. No browser must stay open.
begin;
create extension if not exists pg_cron;
create extension if not exists pg_net;
do $$ begin
 if not exists(select 1 from vault.secrets where name='homeboard_weekly_cron_secret') then
  raise exception 'Create the weekly secret and configure the Edge Function first';
 end if;
end $$;
select cron.schedule('homeboard-weekly-summary','*/15 * * * 1',$job$
 select net.http_post(
  url:='https://yflzmwriknvxhwhaetuk.supabase.co/functions/v1/weekly-summary',
  headers:=jsonb_build_object('Content-Type','application/json','x-homeboard-cron-secret',
    (select decrypted_secret from vault.decrypted_secrets where name='homeboard_weekly_cron_secret')),
  body:='{}'::jsonb
 );
$job$);
commit;
select jobname,schedule,active from cron.job where jobname='homeboard-weekly-summary';
