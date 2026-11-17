# Homeboard customer release — Development setup

This release targets Development. Install the backend before replacing an older interface; access enforcement and the matching activation controls must be released together. Production remains on its existing release. Public publishable keys cannot install database changes or deploy Edge Functions, and this session has no Supabase administrator connection.

## Decisions

- Email troubleshooting must retain Supabase and Brevo without extra costs (operator decision, 2026-11-01). Do not require a paid domain or switch to Gmail SMTP as the next step.
- Keep recovery simple: ordinary email/password recovery, no customer recovery phrase.
- The application administrator can manage household metadata and access passes. RLS prevents an administrator who is not a member from reading household planners through customer APIs. A database operator still has technical access; this is not end-to-end encryption.
- One six-calendar-month pass covers the household. First activation is free while launch access is enabled. Renewals require the Homeboard operator's approval; an owner cannot grant themselves another free period. Paid checkout is disabled.
- An early renewal adds six months to the existing expiry; a late renewal starts from activation. After expiry, the board remains readable and exportable. Server rules enforce writes using server time.
- Existing households receive a six-month transition period when the access migration is first installed. Reapplying it does not extend that period. New households need activation.
- Automatic renewal-email delivery and the external independent-backup destination are awaiting the user's specific approval. In-app expiry notices and local encrypted backup/restore tooling are implemented. No scheduled external job has been installed.

## 1. Apply the database upgrade in Development

Open **Homeboard Development**, project `axfxuqihsscjekicbgkk`, in the Supabase dashboard. Open SQL Editor and run the complete contents of `supabase/customer-release-development.sql`.

The bundle includes invitation management prerequisites, access passes, short invitation codes, bounded delivery requests, and account export/deletion cleanup for the new records. It assumes the previously tested household and account-data migrations are already installed. It does not delete existing planner data. It stops before making changes if its prerequisite functions are missing.

Expected result: no SQL errors. A schema-cache reload is included. Do not run the bundle in Production as part of this test.

## 2. Deploy the household email function

In Development → Edge Functions, create/deploy **household-email**. The dashboard-ready single-file source is `supabase/functions/household-email/dashboard.ts`. It is generated from the tested handler and entry point; do not maintain a separate edited copy. Disable the gateway JWT check for this function: the handler validates the bearer with Supabase Auth, and every database operation checks the current live session and household role.

Configure these Edge Function secrets in Supabase, never in the browser or this chat:

| Secret | Value / purpose |
|---|---|
| `BREVO_API_KEY` | Your transactional-email API key |
| `HOMEBOARD_FROM_EMAIL` | A sender address verified in Brevo |
| `HOMEBOARD_SITE_URL` | `https://nickhijden.github.io/homeboard/dev/` |
| `HOMEBOARD_ALLOWED_ORIGINS` | `https://nickhijden.github.io` |
| `HOMEBOARD_OPERATOR_EMAIL` | Your address for owner renewal requests |

Supabase supplies `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` inside the function. The service-role key must never enter app source. The prepared November 1 update sends code-only invitation/pass emails and link-free change notifications. When the member ticks the notification checkbox, the item title and added/updated action are shared; descriptions and notes are excluded. Deploy the regenerated household-email/dashboard.ts before publishing the matching frontend. Recipients are resolved from verified household membership. Invitation delivery failure returns a usable manual link to its authorized owner without claiming email delivery succeeded.

The operator must already be in the existing `platform_admins` allowlist. Approval sends a new activation code to the verified current owner; a renewal request alone does not extend access. A received code is single-use, tied to that household and email, and expires after 30 days.

The administration list shows expiry dates and a **Renewal requested** marker. Approving a new pass clears that pending marker. This view includes access metadata only; it does not fetch planner documents.

Supabase Edge Functions have changing outgoing IP addresses. Approving individual addresses in Brevo does not provide reliable API delivery. Brevo's **Settings → Security → Authorized IPs → API keys** setting can disable API IP blocking while retaining API-key authentication; this applies to all API keys in that Brevo account and removes one protection layer. Keep the secret server-side and use a dedicated key with only the necessary transactional-email permissions. If IP allowlisting is required, route requests through a server with a fixed outgoing IP. SMTP IP blocking is a separate setting. See [Supabase's IP guidance](https://supabase.com/kb/troubleshooting/why-supabase-edge-functions-cannot-provide-static-egress-ips-for-whitelisting) and [Brevo's settings](https://help.brevo.com/hc/en-us/articles/5740111683858-Authorize-and-block-IP-addresses-for-API-and-SMTP-security).

## 3. Configure account confirmation and recovery URLs

In Development → Authentication → URL Configuration, use `https://nickhijden.github.io/homeboard/dev/` as the Site URL. Allow that URL and its invitation/activation query variants (for example `https://nickhijden.github.io/homeboard/dev/**`). Do not use a Production callback for Development.

The app supplies `redirect_to` for signup and password recovery. The default Supabase confirmation/recovery templates must retain the confirmation URL. Password recovery opens a new-password form, validates the emailed token with Auth, and preserves existing household data. Supabase authentication email delivery is configured separately from the `household-email` Edge Function; configuring Brevo for invitations alone does not configure Auth SMTP.

Use [Supabase redirect URL guidance](https://supabase.com/docs/guides/auth/redirect-urls) and [password recovery guidance](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail) for the provider settings. Configure a verified custom SMTP sender for real customer delivery; do not treat a mocked signup test as evidence of delivery.

In Development → Authentication → SMTP settings, enable custom SMTP with host `smtp-relay.brevo.com`, port `587`, the **SMTP login** shown in Brevo, and a **Brevo SMTP key** as the password. Use a verified sender address and sender name `Homeboard`. The SMTP key is separate from `BREVO_API_KEY`. Keep the default Auth confirmation URL in the email template. See [Supabase SMTP setup](https://supabase.com/docs/guides/auth/auth-smtp) and [Brevo SMTP setup](https://help.brevo.com/hc/en-us/articles/7924908994450-Send-transactional-emails-using-Brevo-SMTP).

If a signup-confirmation email is missing, use **Resend confirmation email** in Homeboard with the signup address. A successful request does not prove inbox delivery; review Brevo Transactional → Logs and Supabase Auth logs if it is still missing. Check whether the existing Auth user is unconfirmed or already confirmed before repeating signup. An already-confirmed user should sign in or use Forgot password. Do not manually mark a customer confirmed to bypass delivery testing.

For a delivery rejection, identify one actual confirmation message by subject, recipient, time and message ID, then inspect its ordered events. Invitation/pass emails use a separate API path; their success or failure does not establish the status of Auth SMTP. Do not copy confirmation URLs, tokens or SMTP keys into diagnostic reports. If a matching confirmation message reached Brevo and received a downstream rejection, changing the SMTP credentials or Supabase source-IP authorization is not supported by that evidence.

Brevo documents automatic rewriting of free-provider senders to a Brevo-owned address. A verified personal sender is not by itself proof of an invalid setup; inspect the actual resulting sender before changing it. Do not manually configure a guessed replacement address. The SMTP login may legitimately have the form `[ID]@smtp-brevo.com`. See [Brevo sender requirements](https://help.brevo.com/hc/en-us/articles/14925263522578-Comply-with-Gmail-Yahoo-and-Microsoft-s-requirements-for-email-senders) and [SMTP troubleshooting](https://help.brevo.com/hc/en-us/articles/115000188150-Troubleshooting-Issues-with-Brevo-SMTP).

Check the affected recipient in Brevo's **Blocked or Unsubscribed contacts** if delivery stops after a rejection. A hard bounce can cause suppression; inspect the recorded reason before changing that status, and preserve intentional unsubscribes and complaints. A `554` spam response alone does not identify content, sender authentication, link reputation or sending IP as the cause. A `452` sending-server block concerns the mail delivery leg, not automatically the Edge Function's changing outgoing API IP. Brevo's **Anonymous email tracking** still tracks opens/clicks and must not be described as disabling tracking. Live Auth templates and tracking settings are dashboard configuration, not controlled by this repository. See [Brevo bounce behavior](https://help.brevo.com/hc/en-us/articles/209435165-What-are-soft-bounces-and-hard-bounces-in-email) and [tracking documentation](https://help.brevo.com/hc/en-us/articles/11643306229906-Can-I-anonymize-the-tracking-of-opens-and-clicks-for-my-emails).

### Development confirmation template

Read-only Brevo inspection on November 1 found that the failing confirmation's HTML link was replaced with a click-tracking URL, whereas the delivered invitation used ordinary text URLs. Supabase [warns against external email tracking on authentication links](https://supabase.com/docs/guides/auth/auth-email-templates). After the operator installed the template below, a fresh confirmation was delivered at 17:57 via the same IP that had previously rejected it; its stored body contains the genuine Supabase URL and no click-tracking redirect. This validates that delivery attempt, not every provider or the receiver's precise spam-filter rule.

Keep `supabase/email-templates/confirm-signup.html` as the **Development** Confirm signup HTML body. The subject, sender, Brevo SMTP settings, redirect configuration and email-confirmation requirement remain in place. This template prints `{{ .ConfirmationURL }}` as visible text rather than wrapping it in an HTML anchor. A recipient may need to copy the complete URL into the browser. Do not substitute a static URL or token. Applying or restoring Auth templates is a Supabase dashboard operation; publishing frontend files does not install them. Production was not changed.

Complete the customer checks by opening the newly received URL, signing in, accepting the household invitation and separately testing password recovery. No automated test or Brevo delivery event proves those steps. Future changes to the template must recheck delivery and link preservation. The assistant used the diagnostic API only for reading; the operator installed the template and requested the mail.

## 4. Publish and test Development

After the backend steps succeed, publish the prepared `dev/` release only. Keep the production files unchanged. The customer flow should be:

1. Open Development in a fresh browser profile. See sign-in/create-account and a separate demo.
2. Sign up with a disposable email and accept the documents. Confirm the email and sign in.
3. Enter a household name and member names, then create it. Two editable example tasks appear for the first household.
4. Request the free launch pass. Open its email and sign in as the owner. The link fills in the code and opens Household access: press **Activate or extend access**. Confirm the displayed **Access until** date is six calendar months away, then refresh after at least a minute and confirm it is unchanged. Before activation the interface says **Activation required**, rather than implying a pass has expired. Customer setup never asks for a Supabase URL or key.
5. Invite another disposable email automatically; confirm that account, then join through the link or fallback code. A used or renewed code must fail.
6. Rename a person; assign and rotate a recurring chore. Record the actual completion date. Compare “Every 4 weeks” with “Every calendar month.” Check that a Together task appears once.
7. Enable an entry-change notification, save, and confirm the other verified member receives the title and added/updated action, without notes or links. An unsuccessful cloud save must not send a notification.
8. Request renewal as owner, approve it as operator, then redeem it as owner. Check early/late extension behavior using synthetic household dates only.
9. Test expiry: view and export remain available; edits fail in both UI and direct authenticated API writes. The operator sees metadata but cannot read a non-member household planner through customer APIs.
10. Test Forgot password in a signed-out browser. Open the reset email, set a new password, and sign into the same existing household.
11. On the actual iPad mini 2: install through Safari Share → Add to Home Screen, test portrait/landscape, completion, offline reopening, reconnect sync, backup download/copy and restore. On a phone: pinch/pan the overview, edit without losing zoom, then use Fit board to screen.

Never use the original production household for deletion or expiry tests. Local tests use synthetic accounts, mocked Auth/email calls, and real isolated PostgreSQL with a synthetic Auth schema. They do not prove Supabase deployment, live email delivery, production backup recovery or physical iPad behavior.

## Independent backups

`scripts/backup-database.cjs` creates an AES-256-GCM encrypted custom PostgreSQL archive and checksum in a local folder. It requires `HOMEBOARD_DB_URL`, `HOMEBOARD_BACKUP_PROJECT`, and a random 32-byte base64 `HOMEBOARD_BACKUP_KEY` in the operator's environment. Use a direct or session-mode connection and a compatible `pg_dump` version. The script rejects a connection that does not match the configured project. It does not upload anything.

Keep the encryption key in a separate password manager/recovery location; customer passwords are not backup keys. A backup without its key cannot be restored. Auth and planner data are sensitive even when encrypted. Independent storage and automated delivery remain pending destination approval and operator credentials.

`node scripts/restore-backup-check.cjs <encrypted-archive>` decrypts in memory and restores only into a newly created network-isolated local PostgreSQL container. It never accepts a live restore target and never ignores restore errors. The default image is `postgres:16-alpine`; managed Supabase extensions or a newer source database require a matching restore environment before this check can validate a real project. The synthetic rehearsal is a test of the tooling, not proof that a production archive is recoverable. Rehearse a real restore before calling the backup system ready.

The existing `operations/database-backup-workflow.yml` is an inactive draft; do not install it while destination approval is pending. No `.github/workflows` backup job is created by this release.

## November 1 mail update — prepared, not deployed

Deploy the regenerated `supabase/functions/household-email/dashboard.ts` to Development, then release the matching frontend. Invitation and pass emails now use codes only. Existing invitation links remain valid. Change notifications include the explicitly shared item title, item type and added/updated action, without notes or descriptions. No actual email delivery is established by the mocked tests.

Install `supabase/email-templates/reset-password.html` in Development Authentication → Emails → Reset password. It retains the dynamic ConfirmationURL as copyable text without an HTML anchor, like the working signup template. Test password recovery separately; do not claim that removing links guarantees delivery. The pass bounce cause has not been verified.

Test with two verified Development household accounts: edit a synthetic task, select Email the other members, save, and inspect the other member inbox and Brevo log. The sender is not the recipient. Repeat without the checkbox and ensure no notification is sent. Test a pass code with a disposable household requiring activation. Complete physical tablet/phone checks before production.


## November 17: corrected missed weeks and new-account operator emails

Frontend release 20261117-01 rechecks missed-week records against completions by task ID and calendar week, including Sunday and older records without occurrenceDate. A late upload of an on-time completion clears the false badge; actually completing a task in a later week does not clear the earlier missed week. The same correction is bundled into weekly-summary/dashboard.ts. The existing weekly schedule/delivery issue is separate and remains unverified.

Apply these backend steps separately in Production (yflzmwriknvxhwhaetuk) and Development (axfxuqihsscjekicbgkk):

1. Replace weekly-summary's index.ts with supabase/functions/weekly-summary/dashboard.ts and deploy. This updates its missed-task calculation; it does not repair or verify its cron configuration.
2. Create Edge Function signup-notifications, paste supabase/functions/signup-notifications/dashboard.ts as index.ts, deploy and turn gateway Verify JWT OFF. The handler still requires its private x-homeboard-cron-secret. It reuses the project's existing BREVO_API_KEY, HOMEBOARD_FROM_EMAIL and HOMEBOARD_WEEKLY_CRON_SECRET. If the last secret was never configured, follow supabase/weekly-summary-secret.sql and copy the returned value directly into the matching Edge secret; never paste it into chat.
3. Run supabase/signup-notifications-install-production.sql in Production and signup-notifications-install-development.sql in Development. Never swap these files. They install private settings/delivery records and a five-minute job using the matching Vault secret. See [Supabase scheduling documentation](https://supabase.com/docs/guides/functions/schedule-functions).
4. Create one new test account through the chosen environment. Within approximately five minutes, check the signup-notifications invocation and Brevo logs, then the inbox at nickyjim@live.nl. Verify the subject identifies Production or Development. Confirmation is not required for this operator notification, and the message states whether the email has been confirmed. Receiving the operator email does not confirm the user's email.

Only accounts created after the first SQL installation qualify; rerunning installation preserves that cutoff. Claims are made on the server from auth.users, once per new account, never from a browser signup-success message. No signup trigger or Auth transaction is changed. The email contains account email, creation time and confirmation status, with no household content, passwords or tokens. No historical-account backfill is enabled.

A private ledger records reserved, accepted, failed or unknown. Accepted means Brevo accepted the request, not confirmed inbox delivery. Failed/unknown/reserved records are not automatically retried because an interrupted request may already have sent mail. Check Brevo before any manual recovery; do not delete reservations blindly. Account deletion removes its ledger row. The recurring job does not depend on a browser remaining open.

Read-only delivery check in SQL Editor (contains no recipient addresses):

    select status, count(*) from public.homeboard_signup_notifications group by status;

Local tests use synthetic Auth data and mocked email requests, including a real isolated PostgreSQL database. No live signup email or deployment of these Edge functions was performed by those tests. The Supabase plugin remains DISABLED_BY_ADMIN; backend installation requires the dashboard operator.
