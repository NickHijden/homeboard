# Homeboard email reminders

The web app stores each event's reminder preference as `day-before` by default. Existing events without this field also use the day-before default. The reminder function checks tomorrow's open events at 09:00 Europe/Amsterdam and sends one friendly email per event to the configured household addresses.

## One-time setup

1. Create a free Brevo account and verify one sender email address. Domain authentication is recommended for deliverability, but the sender address must be verified before it can be used. Keep the Brevo API key private.
2. Deploy `supabase/functions/send-reminders/index.ts` with the Supabase CLI or Dashboard. The root `supabase/config.toml` allows the scheduled request to call the function.
3. Set these Supabase Edge Function secrets; do not put them in Homeboard or GitHub:

   - `BREVO_API_KEY`
   - `HOMEBOARD_FROM_EMAIL` (for example `nickyjim@live.nl`)
   - `HOMEBOARD_NICK_EMAILS` (comma-separated Nick addresses)
   - `HOMEBOARD_STEPHANY_EMAILS` (comma-separated Stephany addresses)
   - `HOMEBOARD_CRON_SECRET`
   - `HOMEBOARD_TIME_ZONE=Europe/Amsterdam`
   - `HOMEBOARD_REMINDER_HOUR=9`

4. Run the table section in `supabase/reminders-setup.sql`.
5. Replace the placeholders in the scheduling section of that SQL file, then enable the 15-minute cron job.

The function uses a reminder log so a retry cannot send the same reminder twice. It also skips completed events and events marked “No email reminder”.
