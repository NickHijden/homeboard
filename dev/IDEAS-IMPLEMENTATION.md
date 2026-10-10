# Homeboard Ideas implementation

Source: the project chat **Ideas**, read in full on 2026-10-09. The user's request in **Implement privacy flow** authorizes implementation of the numbered ideas. Unselected brainstorming suggestions are not part of this scope.

| # | Request | Implementation / validation status |
|---|---|---|
| 1 | Broad tablet compatibility, including iPad mini 2 | Existing ES2018 and browser-API fallbacks retained; physical-device checks required |
| 2 | Rotate recurring chores between members | Implemented locally; assignment follows the recurring occurrence; unit/browser coverage |
| 3 | Portrait/landscape, text size, touch targets | Display size controls and existing responsive layouts retained; phone browser coverage; actual iPad checks pending |
| 4 | Offline reading and reconnect sync | Scoped caches retained; access cached for offline work until expiry; reconnect/isolation regressions pass |
| 5 | Scheduled quiet evening mode | Local time schedule and overnight boundaries implemented; device-specific preference |
| 6 | Independent automated database backups and restore checks | Local encrypted archive and isolated restore scripts tested with synthetic PostgreSQL; automated external destination/retention approval and live configuration pending |
| 7 | Restore a backup on a tablet | File/copy fallback and browser backup restore covered; physical iPad mini 2 test pending |
| 8 | Build a board before purchasing and retain it | Free launch access pass; no card required; keep the same household on renewal |
| 9 | No customer Supabase URL/key entry | Implemented in central public configuration |
| 10 | Duplicate completed laundry occurrences | Existing reconciliation retained; Together chores now occupy one row; browser regression coverage |
| 11 | Development badge on production | Existing hidden badge fix and separate environment tests |
| 12 | Optional notifications when adding or updating entries | Implemented locally; generic messages only, server-selected verified recipients, quota/deduplication, successful sync required; provider deployment pending |
| 13 | Enter actual completion date; four weeks distinct from a calendar month | Implemented and tested: actual date determines the next due date; 28-day and calendar-month intervals remain distinct |
| 14 | Phone overview, pinch zoom/pan, fit-to-screen | Full-width phone viewport, native zoom/pan, gesture guard, Fit and stacked alternative implemented; physical phone check pending |
| 15 | Install / add to home screen guidance | Native install prompt where supported, Safari instructions, 192/512 PNG manifest icons and Apple touch icon |
| 16 | Completed tasks stay completed across reload, sync, offline and rollover | Existing recurrence regressions retained; recorded-date and profile/rotation checks added |
| 17 | Household content protected from administrators | Recovery-first design: application admins see metadata, RLS blocks non-member planner reads, ordinary Forgot password added and tested. Database operators still have technical access. No customer recovery phrase or end-to-end encryption claim. |
| 18 | Confirmation email returns to correct live environment | Explicit signup/recovery redirects preserve invitation context; Auth allowlist and real email delivery need operator validation |
| 19 | Privacy notice, terms acceptance, sensitive-data rules | Implemented; accepted policy version and time stored; final legal review remains a commercial-launch requirement |
| 20 | Ask household names; use and edit them throughout board | Names requested at creation, editable in Settings, merged across devices; assignments use stable IDs; removed people’s tasks remain visible; HTML escaping tested |
| 21 | Login before personal board; separate demo; remembered-device offline access | Implemented and browser-tested; demo uses separate storage and makes no cloud requests |
| 22 | Guided onboarding, email invitations, one-use fallback code | Prepared UI/Edge/SQL: create, name members, activate free pass, invite by email or manual fallback; short codes are hashed, verified-email-bound, single-use and rotated on renewal; backend deployment pending |
| 23 | Development cannot copy data into production | Existing project/session/cache separation retained; labelled cross-environment backup imports rejected; explicit replacement confirmation; no Production release |
| 24 | Free/paid time-limited household passes, activation, expiry, renewal | Six-month first passes and operator-approved renewals implemented; server expiry enforcement, read-only refresh, export/delete cleanup and in-app expiry notices tested. Scheduled email reminder destination awaiting approval; paid checkout disabled. |

Development publishing only. Production data is not a test fixture. No real invitations, notification emails, payments or destructive account actions are performed by automated tests.

The currently available tools have no Supabase administrative connection. SQL/Edge deployment cannot be claimed complete from local tests or public publishable keys. Prepared migrations, server code and setup steps must remain explicit about that limitation.

Development release: `20261010-01-staging`. The installed access RPCs and email handler were confirmed reachable on 2026-10-10 without accessing customer data or sending email. The release includes the activation interface missing from `20261009-06-staging`; real customer activation and delivery still need validation. Follow `CUSTOMER-RELEASE-SETUP.md`; the combined migration is `supabase/customer-release-development.sql` and the dashboard function source is `supabase/functions/household-email/dashboard.ts`.

Automatic approval review rejected an access-check fallback; it was removed and access remains strict. Review also requires explicit approval for scheduled renewal data sent to Brevo and daily encrypted backups retained by GitHub for 30 days. Those questions are pending; no scheduled external job was installed.
