# Phase 3 — customer onboarding and household accounts

This is the development plan and review note for the next product phase. The
current production board and its existing `planner_documents` data are not
migrated by this phase.

## Current limitation

The current cloud sync model stores one complete planner document under one
authenticated user's id. It is suitable for the current two-device pilot, but
it is not a safe customer model for invitations or multiple households:

- customers still enter a Supabase project URL and publishable key;
- there is no household or membership identity in the database;
- invitation records and recipient verification do not exist;
- the client can upload a whole document, so concurrent edits need a defined
  conflict policy before this becomes a shared service.

## First foundation added

[`supabase/households-setup.sql`](supabase/households-setup.sql) adds a
development-only foundation that can coexist with the old table:

- `households` — the household account and its creator;
- `household_members` — owner/member membership rows;
- `household_invitations` — email, expiry, single-use state, and a token hash;
- `household_documents` — one planner document owned by the household;
- `create_household()` — an atomic function that creates the household, owner,
  and empty document together;
- RLS policies that allow members to read household data and owners to rename
  a household, while blocking direct membership and invitation writes.

The raw invitation token is intentionally not stored. The later invitation
endpoint must hash the token, expire it, make it single-use, and only accept it
when the signed-in user's verified email matches the invited address.

## Safe implementation order

1. Run and review the SQL in the separate Homeboard Development Supabase
   project only.
2. Add centrally configured authentication so a customer never enters a
   project URL or API key.
3. Add onboarding: create a household or accept an invitation.
4. Add invitation issue/revoke/accept operations with expiry and recipient
   checks.
5. Move the app's document sync from user id to household id, with explicit
   saving/offline/conflict states.
6. Add account, leave-household, remove-member, export, and deletion flows.
7. Test two synthetic households and negative access cases before considering
   any production migration.

## Not changed yet

This step does not change the production schema, existing production data,
reminder jobs, live authentication, or the current public app. It also does
not yet expose the new tables in the UI; doing so before the server-side
invitation and central-auth path exists would create a misleading partial
customer flow.
