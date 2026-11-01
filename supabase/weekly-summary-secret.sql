-- Run separately in each project. The result is a SECRET: do not share it in chat.
-- Copy the returned value into Edge Function secret HOMEBOARD_WEEKLY_CRON_SECRET.
-- This creates a separate Vault entry; it does not replace existing reminder secrets.
select vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'), 'homeboard_weekly_cron_secret')
where not exists(select 1 from vault.secrets where name='homeboard_weekly_cron_secret');
select decrypted_secret as homeboard_cron_secret
from vault.decrypted_secrets where name='homeboard_weekly_cron_secret';
