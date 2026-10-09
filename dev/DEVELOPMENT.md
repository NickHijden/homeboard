# Homeboard development and release rules

Homeboard has two environments:

- **Production**: the public GitHub Pages site and the original Supabase project. It contains the real household data.
- **Development**: the local preview (`http://localhost:4173` or the local Wi-Fi address), or the public staging path (`https://nickhijden.github.io/homeboard/dev/`), and the separate **Homeboard Development** Supabase project. It must contain synthetic data only.

## Development rules

1. Use the local preview for development work.
2. Use only the Homeboard Development Supabase URL and publishable key in the local preview.
3. Local previews display `DEVELOPMENT · LOCAL ONLY` and block the known production Supabase URL. The public staging path displays `DEVELOPMENT · STAGING` and always uses the centrally configured Development project, ignoring saved manual connection settings.
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

For customer-flow or iPad testing, use the public staging path. Its Development connection is built in: customers and testers never enter a project URL or publishable key there. Open Settings, enter email and password, accept the signup terms, and create an account. Staging uses separate browser-storage names from production and rejects saved sessions issued by another project. Manual configuration remains available only in a local developer preview.

## Pre-release checks

### Older iPad compatibility

Browser scripts are served directly without transpilation. Keep their syntax within the ES2018 baseline and feature-detect optional browser APIs. Run `node --test tests/browser-syntax.test.cjs` with the bundled Node runtime before publishing; it uses Node's bundled Acorn parser in a child process. It must reject newer syntax such as optional chaining (`?.`), even when that code is only inside an unused function.

Changing a Playwright user agent to iPad or reducing the viewport does not emulate an older Safari JavaScript engine. The household-controls browser suite separately exercises calendar rendering, Settings, Task overview, Add event, household deletion and logout without native dialog methods or AbortController. A physical iPad check is still required.

The `20261009-03-staging` regression introduced optional chaining and stopped older iPads from parsing the entire app, leaving the calendar blank and buttons inactive. The compatibility correction removes that expression and makes logout tolerate an unavailable AbortController. See [WebKit's JavaScript feature notes](https://webkit.org/blog/11340/new-webkit-features-in-safari-14/) for the newer syntax introduction.

### Release checklist

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
