-- Email reminders for Homeboard
-- Run the table section once in Supabase SQL Editor.

create table if not exists public.homeboard_reminder_log (
  planner_id uuid not null references public.planner_documents(id) on delete cascade,
  task_id text not null,
  occurrence_date date not null,
  sent_at timestamptz not null default now(),
  primary key (planner_id, task_id, occurrence_date)
);

alter table public.homeboard_reminder_log enable row level security;
revoke all on public.homeboard_reminder_log from anon, authenticated;
grant all on public.homeboard_reminder_log to service_role;

-- After deploying the send-reminders function, run the scheduling section.
-- Replace each placeholder before running it. Keep the cron secret private.
-- select vault.create_secret('https://YOUR_PROJECT_REF.supabase.co', 'homeboard_project_url');
-- select vault.create_secret('YOUR_SUPABASE_PUBLISHABLE_KEY', 'homeboard_publishable_key');
-- select vault.create_secret('A_LONG_RANDOM_CRON_SECRET', 'homeboard_cron_secret');
--
-- select cron.schedule(
--   'homeboard-reminders-every-15-min',
--   '*/15 * * * *',
--   $$
--   select net.http_post(
--     url := (select decrypted_secret from vault.decrypted_secrets where name = 'homeboard_project_url') || '/functions/v1/send-reminders',
--     headers := jsonb_build_object(
--       'Content-Type', 'application/json',
--       'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'homeboard_publishable_key'),
--       'x-homeboard-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'homeboard_cron_secret')
--     ),
--     body := '{}'::jsonb
--   ) as request_id;
--   $$
-- );
