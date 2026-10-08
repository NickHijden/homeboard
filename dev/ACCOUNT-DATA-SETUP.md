# Account export and deletion — Development setup

The Settings interface and server implementation are ready for Development. Applying the SQL and deploying the function requires Supabase operator access; a public app key cannot perform those operations. Do not apply this release to Production yet.

## 1. Install the database migration

Open [Homeboard Development SQL Editor](https://supabase.com/dashboard/project/axfxuqihsscjekicbgkk/sql/new). Run the contents of `supabase/account-data-setup.sql` after the existing household and invitation setup scripts. This migration is transactional and rerunnable. It changes deletion references, installs narrow account RPCs and a cleanup trigger, and does not delete existing data.

Do not rerun the older foundation scripts afterward: they describe the original schema, while this migration is the next schema version.

## 2. Deploy the delete-account function

Open [Development Edge Functions](https://supabase.com/dashboard/project/axfxuqihsscjekicbgkk/functions) and create a function named **delete-account**. For the dashboard editor, paste the prepared single-file version from `supabase/delete-account-dashboard.ts` into `index.ts`. It is generated from the tested `supabase/functions/delete-account/handler.mjs` and its `index.ts` entrypoint.

Regenerate that paste target after source changes with `node scripts/prepare-account-dashboard.cjs`.

Turn off the function’s legacy **Verify JWT** gateway setting, matching `supabase/config.toml`. The handler itself verifies the bearer token with Supabase Auth, requires a confirmed email and fresh password authentication, rejects accounts with enrolled MFA, and validates a live database session before deletion. Disabling this gateway setting does not remove those checks.

Supabase provides `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` inside the function. Do not copy a service-role key into Homeboard, a chat message, or the browser. If the project no longer provides these legacy server variables, configure an equivalent server-only deployment before proceeding.

The default allowed browser origin is `https://nickhijden.github.io` (origins do not contain a `/dev/` path). Optionally set `HOMEBOARD_ALLOWED_ORIGINS` to a comma-separated list of exact additional origins for local testing. Project selection is enforced separately in the app.

An operator with the Supabase CLI can deploy the same source with:

```powershell
supabase functions deploy delete-account --project-ref axfxuqihsscjekicbgkk
```

See Supabase’s [dashboard deployment guide](https://supabase.com/docs/guides/functions/quickstart-dashboard), [function configuration](https://supabase.com/docs/guides/functions/function-configuration), and [server environment variables](https://supabase.com/docs/guides/functions/secrets).

## 3. Validate with the synthetic Development account

Use [Homeboard staging](https://nickhijden.github.io/homeboard/dev/). First export from Settings → Your account & data. Confirm the account, privacy acknowledgement and expected planner records are present, without passwords, session tokens or invitation tokens. Device data is included only if explicitly checked. The existing planner backup remains the restorable format.

For destructive validation use a disposable Development account, never the original household account. Confirm its email first. Export before deleting. Test wrong-password rejection and cancellation, then delete the disposable account and verify its Auth user, private planner and sole-member households are gone. A remaining member’s shared planner must survive. A shared owner must transfer ownership before deletion.

Live backend validation is pending until steps 1–2 are complete. Local tests verify the handler using mocked Auth calls and the SQL against real PostgreSQL with a synthetic Auth schema; these do not establish deployment or real Supabase behavior.

## Behavior and limits

- Export includes a whitelisted account profile, policy metadata, sign-in provider names, accessible cloud planners, invitations involving the account, the user’s administrative actions, and reminder history if that table exists. Other users’ private planners, credentials, token hashes, provider logs and infrastructure backups are excluded.
- Shared planner entries have no per-author ownership field. Deleting a member’s account retains those entries for the remaining household. The confirmation screen states this.
- A platform administrator must have their administrator role removed by another operator before self-deletion. Existing administrative action records remain with the account ID set to null; household names and action dates remain.
- Fresh password authentication and an exact DELETE confirmation are required. MFA accounts use assisted deletion until an MFA reauthentication flow is built. OAuth-only accounts without a password also require assisted deletion.
- A short-lived deletion intent captures the reviewed household list. The auth deletion trigger rechecks ownership and the snapshot while serializing membership changes. Cleanup and auth deletion occur in one transaction. Storage objects owned by the user can cause Supabase to reject deletion; this application currently does not create them. Resolve any such objects through the operator before retrying.
- The trigger also protects administrative dashboard deletion from removing a shared owner or active platform admin. An expired app deletion intent requires a fresh in-app review before deletion; an operator may remove that intent after separately reviewing the account.
- On confirmed success, this environment’s login, planner, backup, legacy keys and IndexedDB data are cleared. Other open tabs running this release clear their state too. Older app versions and other devices may retain offline copies and must have site data cleared separately. Downloaded exports cannot be remotely erased.
- A lost deletion response preserves local data and signs out instead of resuming sync with an uncertain account state. Check the server before retrying.
- The service worker now caches only same-origin assets. The release version change removes its older cache, including cloud responses older builds might have cached.

## Local verification

```powershell
node --test tests/*.test.cjs
node --test tests/account-data.database.cjs
node --test tests/account-data.browser.cjs tests/privacy-flow.browser.cjs
```

The database test requires Docker with `postgres:16-alpine` already present. It creates and removes its own temporary container, without network access or persistent volumes. Browser tests require Playwright and use installed Edge on Windows. A physical iPad check remains necessary.
