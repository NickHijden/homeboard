# Homeboard staging QA checklist

Use this checklist on the public staging site before any production release:

`https://nickhijden.github.io/homeboard/dev/`

Staging connects to **Homeboard Development** automatically. Test the customer flow with email, password and the signup acknowledgement; no project URL or key is required. Use synthetic names and data.

1. Confirm the page shows `DEVELOPMENT · STAGING` and Settings has no project URL, API key or Save connection fields.
2. Add a to-do item and a grocery item; reload and confirm both remain.
3. Add a one-time calendar event with a start and end time.
4. Add a fixed-day task and an any-day weekly task.
5. Edit an item, mark it done, delete it, and test undo where available.
6. Download a backup, change a synthetic item, then restore the backup.
7. Open the same development account on a second test device and confirm sync.
8. Confirm the production site still shows the real household data and is never configured with the development project.

The test is complete only when all items work on the target iPad and laptop. Never use real household data on staging.

## Privacy and signup

1. In Settings, confirm that a new account starts with the acknowledgement unchecked. Attempt account creation and confirm the checkbox receives focus with an explanation; no signup request should be sent.
2. Open Terms of Use and Privacy Notice. Confirm each link opens the correct section in a new tab and that returning preserves the email, password, and current checkbox choice. Check readability on the target iPad and a narrow phone screen.
3. Check the acknowledgement and create a synthetic development account. Verify `user_metadata.homeboard_acknowledgement` on that development account contains the displayed draft versions and an ISO timestamp, including when email confirmation is required. Confirm the password and checkbox clear after a successful request.
4. Sign in to an existing synthetic account with the checkbox unchecked. Confirm ordinary sign-in still works. Sign out and confirm any new signup needs a fresh acknowledgement.
5. Change the signup email and confirm the checkbox resets. With a failed signup request, confirm retry is available and no duplicate request can be sent while one is pending.
6. After the updated service worker installs, go offline and open each document link from Settings. Confirm all three sections and their styling remain readable. Confirm local planner editing remains available.
7. Confirm the sensitive-information warning is visible next to task/event titles and day labels, and when editing a list item. It should not appear under the to-do or grocery quick-add inputs. On the iPad, confirm long event forms scroll so Save and Cancel remain reachable.

The local browser suite in `tests/privacy-flow.browser.cjs` covers these UI paths with mocked cloud responses. It does not replace verifying metadata persistence in the separate Development project or testing the target iPad.

## Household invitations

1. In one private browser session, sign in as the owner of a synthetic Development household. Add a recognizable test planner item and create an invitation for a second test email.
2. In a separate browser profile, create the second account through the normal staging signup form, confirm its email, then sign in. No project URL or key should be requested.
3. Paste the invitation token and choose Join. Confirm the household name and shared test item appear. The owner should see the invitation marked accepted and the second account listed as a member.
4. Make a test change as the member, sync, and confirm the owner sees it. Confirm both accounts can reload and reopen the household.
5. Reusing the token should be rejected. A different signed-in email, an unconfirmed account, or an expired or revoked token must not gain access.

If an older database returns `column reference "household_id" is ambiguous`, the operator repair is documented in `INVITATION-ACCEPTANCE-FIX.md`. Customers do not perform that setup. The real PostgreSQL regression suite runs with `node --test tests/invitation-acceptance.database.cjs` and requires Docker with an existing `postgres:16-alpine` image. Its Auth schema is synthetic; live signup and confirmation delivery still need the checks above.
