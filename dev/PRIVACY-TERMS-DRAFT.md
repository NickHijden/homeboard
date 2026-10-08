# Homeboard privacy and acceptable-use draft

> Draft for product implementation and legal review. This is not legal advice.

## Acceptable use acknowledgement

Homeboard is a household-planning tool. You may enter information only when you are permitted to store it and share it with the members of your household.

Do not enter payment-card details, passwords, government identification numbers, medical records, or other highly sensitive information into Homeboard. Homeboard is not designed to store or protect those types of information.

You are responsible for the information you choose to enter, for having the necessary permission to share it with household members, and for keeping your account credentials secure. These responsibilities do not remove Homeboard's own obligations under applicable privacy and security laws.

## Signup acknowledgement

By creating a Homeboard account, I confirm that I have read and agree to the [Terms of Use](#terms-of-use) and acknowledge the [Privacy Notice](#privacy-notice). I understand that Homeboard is a household planner and that I must not enter payment-card details, passwords, medical records, or other highly sensitive information.

## Terms of Use

Homeboard is provided for household planning, scheduling, task management, and shared household lists. Users must not use it to store payment-card data, passwords, medical records, government identification numbers, or other information requiring specialist security controls.

Users must use only information they are authorised to enter and share. Users are responsible for their account credentials and for checking that information shared with household members is appropriate.

Homeboard may suspend or delete accounts or households that misuse the service, compromise security, or violate applicable law. Nothing in these terms limits rights or responsibilities that cannot legally be excluded.

## Privacy Notice

Homeboard processes account details, household membership information, invitations, and the planner content users choose to enter. This information is used to provide authentication, shared household planning, synchronisation, security, support, and service administration.

Household planner content is shared with the members of the relevant household. Service providers used to host the application, database, authentication, email, and operational services may process information on Homeboard's behalf where required to provide the service.

Users may request access, correction, deletion, or other rights available under applicable privacy law. Account and household deletion should be handled through the available Homeboard controls or by contacting the Homeboard operator.

The final controller/processor description, retention periods, provider list, international-transfer wording, contact details, and legal basis should be completed before public commercial launch and reviewed by a qualified privacy adviser.

## Implementation notes

- The readable app document is [`privacy.html`](privacy.html), version `2026-10-08-draft-1`. Its acceptable-use, terms, and privacy sections preserve the draft wording above. Settings and signup link to these sections in a separate tab so reading them keeps the signup form intact. The service worker caches the document for offline reading.
- New account creation requires an unchecked acknowledgement checkbox. The signup handler also checks it before making a request. Existing sign-in and local planner use do not require a new acknowledgement.
- The sensitive-information warning also appears next to event/task titles and day labels, and inside the list-item edit prompt. Fields with a warning are linked to it for screen readers. Per the requested layout, the to-do and grocery quick-add fields do not show this warning. The app has no separate notes or description fields yet.
- Signup sends `data.homeboard_acknowledgement` to Supabase Auth with `terms_version`, `privacy_notice_version`, `acceptable_use_version`, and a client-generated ISO `acknowledged_at` timestamp. Supabase stores this as account user metadata, including for signups awaiting email confirmation. It is mutable user metadata, not an immutable audit record or a server-enforced signup policy. No database migration is required for this UI flow.
- Acknowledgement resets on page initialization, email or connection changes, successful authentication, and sign-out. Failed requests keep the current choice for retry. The app prevents duplicate authentication requests while one is pending.
- When changing the wording, update this draft, the readable document, the signup label where relevant, and `PRIVACY_TERMS_VERSION` in `app.js`. Update the document's displayed version to match. Final operator details and legal review remain outstanding; this implementation does not establish legal compliance or add account deletion controls.

### Validation

Run `node --test tests/*.test.cjs` for the regression suite, including document fidelity and release/cache checks. Run `node --test tests/privacy-flow.browser.cjs` with Playwright available to Node (installed locally or supplied through `NODE_PATH`) for the browser flow tests. They use synthetic data, a temporary loopback server, and mocked authentication responses. On Windows they launch installed Edge; `HOMEBOARD_BROWSER_CHANNEL` can select another installed Playwright-supported channel.
