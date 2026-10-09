# Development invitation management

This update adds owner-only **Renew link**, confirmation before renewal/revocation, and clearer Pending, Accepted, Expired and Revoked dates. An accepted invitation displays the date the recipient joined. Accepted and revoked invitations cannot be renewed; create a separate invitation if a revoked recipient should be invited again.

Renewing a pending or expired invitation generates a new single-use link valid for seven days and invalidates that invitation's previous link. Only its hash is stored in the database. The recipient must sign in using the verified email the invitation was issued to. Copy and send the new link yourself: this release does not send invitation emails automatically.

## One-time operator setup

1. Open the **Homeboard Development** [SQL Editor](https://supabase.com/dashboard/project/axfxuqihsscjekicbgkk/sql/new). Confirm the project ID is `axfxuqihsscjekicbgkk`.
2. Open [`supabase/invitation-management-setup.sql`](supabase/invitation-management-setup.sql), copy its complete contents into a new SQL query, and click **Run**.
3. Expect success with no rows returned. The script is repeatable and does not modify existing invitations or planner data when installed. It depends on the household and account-data migrations already used by this Development environment. Do not rerun earlier setup scripts over this upgrade.
4. Reload [Homeboard Development](https://nickhijden.github.io/homeboard/dev/) and check **Version 20261009-06-staging**. Sign in normally and open Settings → Household.

Customers never run SQL or enter Supabase settings. This setup is only for the application operator. The assistant has no administrative connection to this project; live backend validation remains pending until this step has been run.

## Customer-flow checks

Use a synthetic Development household owned by one test account and a separate verified recipient account that is not already a member. Keep the accounts in different browser profiles or devices.

1. As the owner, enter the recipient's email and select **Create invite**. Save the first link. Verify the row says **Pending** and shows an expiry date.
2. Select **Renew link**, then cancel. The first link must remain usable and no new link should appear.
3. Select **Renew link** again and confirm. Copy the new link. The message should say the old link no longer works. No automatic email is expected.
4. As the verified recipient, paste the first link into **Have an invitation?** and select **Join**. It must be rejected. Paste the new link and join: the correct shared planner should open.
5. Return to the owner and reopen Household settings. The row should say **Accepted · joined [date]**, show no renewal/revoke controls, and list the recipient as a member. Reusing the new link must fail.
6. Create another invitation for an unused test email. Select **Revoke** and cancel, then revoke and confirm. The row should show **Revoked**; its link must no longer work. It has no renewal button.
7. If an older invitation is already **Expired**, renew it and verify its new link can be accepted by its verified recipient. Do not alter real invitation dates for testing.
8. Generate a link, then switch households or log out. The link must disappear. A household member must not see owner invitation controls. Check these controls on the target iPad as well.

## Automated validation

- `node --test tests/invitation-management.database.cjs` uses real PostgreSQL in a disposable Docker container, synthetic Auth users/sessions, and no network. It checks migration repeatability, permissions, token rotation, expiry, rollback, concurrent acceptance/renewal, ownership transfer and preservation of other data.
- `node --test tests/invitation-management.browser.cjs` uses a real browser with synthetic cloud responses. It checks statuses, narrow layouts, confirmation/cancellation, creating and renewing links, clipboard fallback, failures/retry, double-click protection and late responses after household changes/logout.
- `node --test tests/browser-syntax.test.cjs` checks the ES2018 syntax baseline for older iPad Safari. Physical iPad testing and real Supabase validation are still required.

Automatic invitation email delivery is the next development step after these controls pass live Development testing.
