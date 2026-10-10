# Homeboard customer release — Development setup

This release targets Development. Install the backend before replacing an older interface; access enforcement and the matching activation controls must be released together. Production remains on its existing release. Public publishable keys cannot install database changes or deploy Edge Functions, and this session has no Supabase administrator connection.

## Decisions

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

Supabase supplies `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` inside the function. The service-role key must never enter app source. Customer notifications contain a generic update notice and link; planner titles, descriptions and notes are excluded. Recipients are resolved from verified household membership. Invitation delivery failure returns a usable manual link to its authorized owner without claiming email delivery succeeded.

The operator must already be in the existing `platform_admins` allowlist. Approval sends a new activation code to the verified current owner; a renewal request alone does not extend access. A received code is single-use, tied to that household and email, and expires after 30 days.

The administration list shows expiry dates and a **Renewal requested** marker. Approving a new pass clears that pending marker. This view includes access metadata only; it does not fetch planner documents.

## 3. Configure account confirmation and recovery URLs

In Development → Authentication → URL Configuration, use `https://nickhijden.github.io/homeboard/dev/` as the Site URL. Allow that URL and its invitation/activation query variants (for example `https://nickhijden.github.io/homeboard/dev/**`). Do not use a Production callback for Development.

The app supplies `redirect_to` for signup and password recovery. The default Supabase confirmation/recovery templates must retain the confirmation URL. Password recovery opens a new-password form, validates the emailed token with Auth, and preserves existing household data. Supabase authentication email delivery is configured separately from the `household-email` Edge Function; configuring Brevo for invitations alone does not configure Auth SMTP.

Use [Supabase redirect URL guidance](https://supabase.com/docs/guides/auth/redirect-urls) and [password recovery guidance](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail) for the provider settings. Configure a verified custom SMTP sender for real customer delivery; do not treat a mocked signup test as evidence of delivery.

## 4. Publish and test Development

After the backend steps succeed, publish the prepared `dev/` release only. Keep the production files unchanged. The customer flow should be:

1. Open Development in a fresh browser profile. See sign-in/create-account and a separate demo.
2. Sign up with a disposable email and accept the documents. Confirm the email and sign in.
3. Enter a household name and member names, then create it. Two editable example tasks appear for the first household.
4. Request the free launch pass. Open its email and sign in as the owner. The link fills in the code and opens Household access: press **Activate or extend access**. Confirm the displayed **Access until** date is six calendar months away, then refresh after at least a minute and confirm it is unchanged. Before activation the interface says **Activation required**, rather than implying a pass has expired. Customer setup never asks for a Supabase URL or key.
5. Invite another disposable email automatically; confirm that account, then join through the link or fallback code. A used or renewed code must fail.
6. Rename a person; assign and rotate a recurring chore. Record the actual completion date. Compare “Every 4 weeks” with “Every calendar month.” Check that a Together task appears once.
7. Enable an entry-change notification, save, and confirm the other member receives a generic email. An unsuccessful cloud save must not send a notification.
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
