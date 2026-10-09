# Household deletion and logout — Development

The Development interface adds a visible **Log out** button beside the signed-in email. Email/password fields are shown only when signed out. Logout removes the saved session immediately and signs out other tabs in the same browser; it also requests server revocation of this session. Offline logout still clears the browser login. Other devices retain their separate sessions. See [Supabase sign-out scopes](https://supabase.com/docs/guides/auth/signout).

Owners can select a household, open **Household options**, and choose **Delete household…**. The confirmation names the household and requires its exact name. Deletion removes that household's shared planner, memberships and invitations for everyone. Accounts, private planners and other households remain. Members keep their existing **Leave** action. Account export/deletion remain under **Advanced account options**.

## One-time operator setup

1. Open `supabase/household-deletion-setup.sql` from this workspace and copy the whole file.
2. Open the [Homeboard Development SQL Editor](https://supabase.com/dashboard/project/axfxuqihsscjekicbgkk/sql/new).
3. Paste and Run. This installs the owner-only function and permissions; running the setup file does not delete any household. It requires the existing household and account-data setup already used for account deletion.
4. Refresh [Homeboard Development](https://nickhijden.github.io/homeboard/dev/).

Customers never enter a Supabase URL/key or run SQL. Production has not been changed. The assistant cannot install this migration without an authorized administration connection; the Development operator must run it once.

## Test through the customer interface

Use disposable Development households with synthetic entries.

1. In Settings, confirm your email and **Log out** are visible. Log out, reload, then sign in again. Your household planner should return. A second tab in the same browser should also log out.
2. Create two households: **Delete test** and **Keep test**. Add a distinct test task to each. Download a backup of Delete test if you want to retain its contents.
3. Select Delete test, open Household options, then Delete household. Enter a wrong name; deletion must remain disabled. Enter the exact name, choose Cancel, and verify the household and task remain.
4. Review deletion again. Type **Delete test** and choose **Permanently delete household**. You should stay logged in, Delete test should disappear, and Keep test should retain its task after a reload.
5. For a shared test household, check that a regular member has no delete action. After its owner deletes it, refresh Household settings as the member: it must disappear, while that member's account and other households remain available.
6. Deleting your last disposable household should leave your account available to create or join another household.

Previously downloaded files and copies on other devices are not remotely erased. Current-build browser copies of the deleted household are cleared in the deleting browser and its other tabs. A deletion marker prevents delayed sync/cache recovery from restoring them there.

## Verification scope

Verified locally on 2026-10-09: all 85 checks in the exact Development browser/unit release package passed, along with all 7 PostgreSQL deletion checks. The additional source-only household schema/invitation checks also passed. Live household deletion remains pending installation of the SQL above and a disposable-household test in Development.

`tests/household-controls.browser.cjs` exercises the actual app in Edge with synthetic intercepted cloud responses: logout, offline behavior, other tabs, member restrictions, exact confirmation, cancellation, rejection, cache cleanup, another household's data, delayed responses, duplicate submissions and a phone viewport.

`tests/household-deletion.database.cjs` runs the migration against an isolated PostgreSQL container with a synthetic Auth schema: repeat installation, owner/member/outsider permissions, revoked sessions, exact/current names, transactional rollback, concurrent ownership transfer, targeted cascades and account preservation. These checks do not establish real Supabase deployment; live validation follows the operator setup above.
