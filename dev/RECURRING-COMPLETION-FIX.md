# Recurring completion fix — 9 October 2026

Development release: `20261009-01-staging`. Production has not received this change. The existing release checklist in DEVELOPMENT.md still applies.

## Problem and behavior

No-fixed-day chores could return to the top of the board while their completion
remained in the history below. Saving a title-only edit reset the task's next due
date to its start week. A newer stale task received through cloud sync could also
overwrite that date independently of the surviving completion history.

The app now reconciles task due dates with completion records before rollover,
when loading saved data or a backup, when merging cloud data, and before saving.
Ordinary task edits preserve recurrence progress. Explicit schedule changes start
a new history boundary, so an old completion cannot override a deliberate reset.

New completions record the specific occurrence and its next due date. Completing
the same occurrence on two devices uses the same completion ID. Undo updates the
current task after sync and records a deletion marker so an old cloud record
cannot silently restore the completion. Timestamps remain ordered when actions
happen within the same millisecond.

Existing completion records are matched by task ID, never by title. Older records
without an occurrence date infer the scheduled occurrence in the recorded week,
or the Monday to which an overdue task would have carried. Duplicate old history
entries in one week do not consume future repeats. Existing history is retained.
Records without a matching task ID cannot safely be associated automatically.

## Validation

The original source failed four of the first seven new browser regressions:
stale sync, legacy completion recovery, title-only editing, and Undo followed by
stale sync. The patched source passes those scenarios.

Validation result: 42 unit/release checks, 15 completion browser regressions, and
23 existing account/privacy/signup browser checks passed (80 total). JavaScript
syntax checks passed. The completion suite includes same-millisecond Undo/redo
and an explicit start-week reset without changing the recurrence interval.

```text
node --check app.js
node --check recurrence.js
node --check sw.js
node --test tests/*.test.cjs
node --test tests/recurring-completions.browser.cjs
node --test tests/account-data.browser.cjs tests/privacy-flow.browser.cjs tests/customer-signup.browser.cjs
```

Browser checks use headless Edge with synthetic data and intercepted cloud
requests. They cover reload/reopen, offline reconnection, independent tasks with
identical names, Undo after sync replaces a task object, re-completion, duplicate
click callbacks, schedule editing, real JSON backup import, and date rollover.
These checks do not establish behavior on the physical iPad's Safari browser or
verify the user's live household data.

Implementation files: app.js and recurrence.js. Regression files:
tests/recurrence.test.cjs and tests/recurring-completions.browser.cjs. Versioned
asset references in index.html, sw.js, and privacy.html match the app version.
