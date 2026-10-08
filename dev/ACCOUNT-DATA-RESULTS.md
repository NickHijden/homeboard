# Account export and deletion validation — 8 October 2026

Release: `20261008-04-staging`. This is a Development release. Production release and real account deletion are not part of this validation.

## Implemented

- Settings account export with optional unsynced device data and a copy fallback for older iPads.
- Server-derived deletion preview, ownership/admin blockers, current-password confirmation and exact DELETE phrase.
- A server-only deletion function that validates identity, reauthenticates, rejects enrolled MFA, validates the preview and hard-deletes the verified caller.
- Transactional database cleanup that preserves shared planners, removes sole-member owned households and removes account-related invitations and private data. Former creators can be deleted after ownership transfer.
- Device cleanup, cross-tab notification and rejection of old sync responses after deletion. Cloud API responses are excluded from the offline cache.
- A dashboard-ready single-file function in `tmp/account-deployment/delete-account.ts` and setup instructions in `ACCOUNT-DATA-SETUP.md`.

## Verification

- 31 unit and regression tests, including the deletion handler’s identity, password, MFA, CORS, confirmation, size, server-failure and secret-handling boundaries.
- One integration test on a real PostgreSQL 16 instance in an isolated temporary Docker container. Assertions cover export isolation, anonymous/stale-session denial, repeatable migration, ownership/admin blockers, changed preview rejection, full rollback after a later deletion error, former-creator references, retained shared planners, invitation/private planner/reminder cleanup, and anonymized administrative audit references. Supabase Auth tables and roles are synthetic fixtures.
- Nine account browser tests and ten privacy browser tests in headless Edge with synthetic data and mocked cloud APIs. Account tests cover downloaded export contents, device opt-in, iPad fallback, failures, blocked ownership, cancellation, escaped household names, duplicate prevention, local and IndexedDB cleanup, cross-tab cleanup, reload, late sync responses, phone layout and real service-worker cache exclusion.
- Phone deletion dialog inspected visually. A physical iPad remains untested.

## Pending live backend validation

The provided Supabase credentials are public app settings. No Supabase management connection or server deployment credential is available in this workspace. The migration and function must be installed in **Homeboard Development** (`axfxuqihsscjekicbgkk`) before live account export/deletion is available.

No live account was deleted during this work. The previously confirmed synthetic Development signup remains available for the next test. Preserve the original household account.

After backend installation, validate an export and a complete deletion using a disposable Development account. Local database and mocked API checks are not a substitute for that live test. Production deployment, final legal/operator details and provider retention configuration remain separate work.
