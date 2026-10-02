# Phase 3 — customer onboarding and household accounts

This is the development plan and review note for the next product phase. The
current production board and its existing `planner_documents` data are not
modified or migrated by the additive household foundation.

## Current limitation

The current cloud sync model stores one complete planner document under one
authenticated user's id. It is suitable for the current two-device pilot, but
it is not a safe customer model for invitations or multiple households:

- the development build still allows an operator to enter its Supabase project
  URL and publishable key;
- there is no household or membership identity in the database;
- invitation records and recipient verification do not exist;
- the client can upload a whole document, so concurrent edits need a defined
  conflict policy before this becomes a shared service.

## First foundation added

[`supabase/households-setup.sql`](supabase/households-setup.sql) adds a
additive foundation that can coexist with the old table:

- `households` — the household account and its creator;
- `household_members` — owner/member membership rows;
- `household_invitations` — email, expiry, single-use state, and a token hash;
- `household_documents` — one planner document owned by the household;
- `create_household()` — an atomic function that creates the household, owner,
  and empty document together;
- RLS policies that allow members to read household data and owners to rename
  a household, while blocking direct membership and invitation writes.

The raw invitation token is intentionally not stored. The later invitation
endpoint in [`supabase/household-invitations-setup.sql`](supabase/household-invitations-setup.sql)
hashes the token, expires it, makes it single-use, and only accepts it when the
signed-in user's verified email matches the invited address.

## Safe implementation order

1. Run and review both SQL files in the separate Homeboard Development
   Supabase project first.
2. Run the reviewed additive migration in the Homeboard production project
   after taking a current backup.
3. Keep authentication centrally configured so a customer never enters a
   project URL or API key.
4. Add onboarding: create a household or accept an invitation.
5. Move the app's document sync from user id to household id, with explicit
   saving/offline/conflict states.
6. Add account, leave-household, remove-member, export, and deletion flows.
7. Test two synthetic households and negative access cases before considering
   any production migration.

## Not changed yet

The additive SQL does not change existing production planner data or reminder
jobs. The public build now uses the central Homeboard project automatically;
the document sync still needs to be moved from user id to household id before
customer households should be treated as fully production-ready.
