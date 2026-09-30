# Homeboard staging QA checklist

Use this checklist on the public staging site before any production release:

`https://nickhijden.github.io/homeboard/dev/`

Configure only the **Homeboard Development** Supabase URL and publishable key. Use synthetic names and data.

1. Confirm the page shows `DEVELOPMENT · STAGING`.
2. Add a to-do item and a grocery item; reload and confirm both remain.
3. Add a one-time calendar event with a start and end time.
4. Add a fixed-day task and an any-day weekly task.
5. Edit an item, mark it done, delete it, and test undo where available.
6. Download a backup, change a synthetic item, then restore the backup.
7. Open the same development account on a second test device and confirm sync.
8. Confirm the production site still shows the real household data and is never configured with the development project.

The test is complete only when all items work on the target iPad and laptop. Never use real household data on staging.
