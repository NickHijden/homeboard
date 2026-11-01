# Weekly household overview — November 1, 2026

The new `weekly-summary` function is separate from the legacy personal `send-reminders` function. It sends a link-free overview to each currently verified household member, including the owner. Each recipient receives a separate message. A week with no missed recurring tasks gets an empty-state overview. It uses synced household documents, not private `planner_documents` or fixed Nick/Stephany addresses.

## Schedule and meaning

Delivery starts Monday at 09:00 **Europe/Amsterdam**, with daylight saving handled by the function. Cron checks every 15 minutes on Mondays. The first scheduled opportunity after this release is November 2, 2026 at 09:00. It only becomes active after the installation below.

The summary covers recurring tasks marked missed in the previous Monday–Sunday week. A later completion does not erase a recorded missed week. Offline changes cannot appear until synced. Existing historical data cannot reconstruct every deleted or overwritten occurrence; history is preserved going forward, with recoverable older records included. Task history shows the latest recorded completion; old fixed-day boolean records only establish the scheduled occurrence date, not when the user actually checked it off.

## Install separately in BOTH projects

1. Run `supabase/weekly-summary-setup.sql` in SQL Editor. It creates an isolated delivery ledger and a service-role-only batch RPC. It does not change planner documents or enable a schedule.
2. Create Edge Function **weekly-summary**, paste the complete `supabase/functions/weekly-summary/dashboard.ts` into **index.ts**, and deploy. Turn the gateway **Verify JWT** switch off: scheduled calls authenticate using the private cron secret. Do not disable the handler's secret check.
3. Run `supabase/weekly-summary-secret.sql`. Copy its returned secret directly into Edge Function secret **HOMEBOARD_WEEKLY_CRON_SECRET**. Do not send the value or its result screenshot in chat. The project's existing **BREVO_API_KEY** and **HOMEBOARD_FROM_EMAIL** are reused. This is separate from the legacy reminder secret, which remains unchanged.
4. In Production run `supabase/weekly-summary-schedule-production.sql`. In Development run `supabase/weekly-summary-schedule-development.sql`. Never swap these two files. They reference different Supabase URLs and the local project's Vault secret. Running the same scheduling file again updates the named job.
5. Verify the returned job is active. After Monday's run, inspect the weekly-summary function logs, the delivery ledger and Brevo logs. `accepted` means Brevo accepted the request, not guaranteed delivery. Recipient-side filtering remains possible.

## Failure behavior

A unique household/member/week reservation prevents concurrent invocations and repeated cron calls from emailing the same recipient twice. Failed or ambiguous sends are retained as `failed` or `unknown`; an interrupted send can remain `reserved`. They are not automatically retried, because a timeout may occur after Brevo accepted the mail. Check Brevo before any operator-led retry. Do not delete reservations blindly. Successful reruns continue with unreserved recipients.

The legacy personal reminder job is not changed or disabled by these scripts. Review whether to keep it for the old private board; it does not implement customer household summaries.

## Validation

Synthetic browser tests cover missed-week persistence after later completion and reload. Unit tests cover completion reconciliation, exclusion of events, Amsterdam summer/winter schedule boundaries, recipient isolation, reservations and provider failures. A real isolated PostgreSQL test covers RPC permissions, verified membership, pagination, reservation uniqueness and account-deletion cleanup. These tests do not prove live Supabase scheduling or real delivery.
