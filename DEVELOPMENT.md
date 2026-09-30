# Homeboard development and release rules

Homeboard has two environments:

- **Production**: the public GitHub Pages site and the original Supabase project. It contains the real household data.
- **Development**: the local preview (`http://localhost:4173` or the local Wi-Fi address), or the public staging path (`https://nickhijden.github.io/homeboard/dev/`), and the separate **Homeboard Development** Supabase project. It must contain synthetic data only.

## Development rules

1. Use the local preview for development work.
2. Use only the Homeboard Development Supabase URL and publishable key in the local preview.
3. Local previews display `DEVELOPMENT · LOCAL ONLY`; the public staging path displays `DEVELOPMENT · STAGING`. Both block the known production Supabase URL.
4. Never put service-role keys, Brevo keys, database passwords, or private exports in this repository.
5. Do not add production reminder secrets or a production cron job to the development project.
6. Use separate test accounts and synthetic households for development.
7. Keep production devices connected to the production project; do not test new code from an installed Homeboard shortcut.

## Local preview

From the project folder, run:

```text
node preview-server.cjs
```

Open the printed local address in a private browser window. Configure the development Supabase connection only in that private window.

For iPad testing when the local laptop address is blocked by a managed network, use the public staging path instead. Configure only the Homeboard Development Supabase URL and publishable key there; never enter the production connection on that path.

## Pre-release checks

Before a production release:

1. Download fresh backups from active household devices.
2. Run the JavaScript syntax checks and recurrence tests.
3. Test event editing, recurring tasks, local save, backup restore, and development sync.
4. Confirm no production credentials or private household data are in the changed files.
5. Bump the visible application/service-worker version.
6. Review the exact changed files and production impact.
7. Publish only the approved release to `main`.
8. Wait for GitHub Pages to deploy, then verify the visible version and the installed Homeboard shortcut.

## Rollback

Static application rollback means publishing a previously verified source revision. It must not restore an old database over newer household data. Data recovery is a separate, explicit operation using a verified backup.
