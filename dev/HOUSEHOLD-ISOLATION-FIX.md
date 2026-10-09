# Household planner isolation — 9 October 2026

Development release: `20261009-02-staging`. Production deployment is separate.

Creating a household now selects it and opens an empty planner. Joining an
invitation selects the invited household and loads its planner. Switching
households restores that household's own saved data and starts a sync.

Previously, changing the selected household changed the cloud destination while
leaving the previous planner in memory. The next sync could merge its tasks,
lists, completions and deletion markers into the new household. An empty shared
document also fell back to the account's private planner. Creating a household
did not select the returned household ID, making its contents particularly
confusing. Browser tests reproduced both failures before the fix.

## Storage and synchronization

- Primary, backup and IndexedDB records are separate for each Supabase project,
  account and household. The account's private planner has its own records too.
- A new shared document containing `{}` is an empty planner. Missing, malformed
  or failed reads stop the sync; they never import private data. Failed household
  membership lookups cannot reroute a shared planner into private storage.
- Switching clears old undo and editor state. Delayed sync responses cannot
  update another household. Offline edits remain in their original cache.
- IndexedDB recovery completes before cloud merging, is tied to its original
  household, and cannot overwrite newer edits. Switching away during recovery
  cannot replace a pending cached board with the temporary empty view.
- Account deletion clears all planner/selection caches for the current app
  environment. Old writes and responses cannot recreate the deleted records.
- Authenticated planners do not import the original pilot football schedule on
  reload. Recurrence completion reconciliation remains enabled.

## Existing data

This change does not remove entries already saved to any cloud planner. If an
earlier version copied tasks into a test household, they remain there until
explicitly cleaned up. Use a newly created test household to verify the fix.

The old unassigned device planner and its backup are preserved under their
original local keys, but are not automatically uploaded into a signed-in
household. They remain accessible after signing out via Settings → Download
backup. A reviewed backup can be explicitly restored into the intended planner.
Do not clear browser storage to apply the update.

## Validation

`tests/household-isolation.browser.cjs` uses the real app in Edge with intercepted
synthetic cloud responses. It covers creation, selection, invitations, reload,
separate tabs, deletion markers, delayed requests, offline edits, failed reads,
membership loss, switching accounts, legacy device data and IndexedDB recovery.
The account deletion and recurring completion browser suites also cover the new
cache layout. No real household or account is deleted by these tests.

All 77 checks in the exact staging package passed: 48 browser checks and 29
unit/release/content checks. All 42 unit checks in the full local source also
passed, including the 13 additional household schema/invitation contracts.
Application and service-worker syntax checks passed. A real Supabase
join/switch/create test and a physical iPad check remain separate from mocked
browser validation.

## Customer-flow check

1. Reload Development on every open test device/tab and confirm version
   `20261009-02-staging` in Settings.
2. Create a fresh disposable household. It should be selected automatically and
   contain no tasks, to-dos or groceries, including after a reload.
3. Add a distinct test item. Switch to the previous household and verify its
   original items remain and the new item does not appear there.
4. Switch back and confirm the new item remains. Continue the account deletion
   checklist only after this isolation check passes.
