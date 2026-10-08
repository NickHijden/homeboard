# Invitation acceptance repair — 8 October 2026

The reported join error, `column reference "household_id" is ambiguous`, is caused by the database function's `RETURNS TABLE` output variable and its `ON CONFLICT (household_id, user_id)` clause using the same name. The corrected query explicitly names the membership primary-key constraint. It preserves the function's API, verified-email checks, row lock, one-time token use and existing membership role.

## Apply to the existing Development database

This is a one-time operator update. Customers still sign up, confirm their email and join normally; they do not enter database settings or run SQL.

1. Open [Homeboard Development SQL Editor](https://supabase.com/dashboard/project/axfxuqihsscjekicbgkk/sql/new) and confirm the project is **Homeboard Development**.
2. Copy all of [`supabase/invitation-acceptance-fix.sql`](supabase/invitation-acceptance-fix.sql), paste it into a new query and select **Run**. Success can be displayed as “Success. No rows returned.” The transaction replaces only the invitation acceptance function and its execute grants. Existing accounts, households, planners and invitations remain in place.
3. Return to [Homeboard staging](https://nickhijden.github.io/homeboard/dev/), sign in using the confirmed email that received the invitation, and retry **Join** with the same token. The earlier database error did not consume it. If it has since expired or been revoked, have the owner create a replacement.
4. Confirm the invited household and its shared planner appear. In the owner's separate browser session, check the member list and accepted invitation status.

Do not recreate the accounts or household. Do not rerun all foundation scripts to apply this small repair. The correction is also included in the full invitation setup file for future fresh installations.

## Verification and deployment status

The original query reproduced the exact error in PostgreSQL 16. After correction, all 17 checks in this command passed:

```text
node --test tests/invitation-acceptance.database.cjs tests/household-invitations.test.cjs tests/account-data.database.cjs
```

The new database suite exercises the real invitation RPCs, including successful acceptance and shared-planner access, wrong and unverified email rejection, anonymous denial, replay prevention, expired/revoked tokens, simultaneous acceptance, existing member idempotency and owner-role preservation. It also recreates the broken function, verifies the failed attempt leaves its token pending and membership absent, installs the repair twice alongside the account-data migration, and successfully retries the original pending token without changing shared planner data.

These checks use isolated local PostgreSQL containers, synthetic Auth fixtures and synthetic households. They do not establish that the live Supabase repair has been applied. The public app key cannot install database functions, and this workspace has no Supabase management connection. Live application and a real two-account join remain pending the operator steps above. Publishing the source to GitHub does not apply the SQL to Supabase. Production was not changed.
