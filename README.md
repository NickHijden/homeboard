# Homeboard

Homeboard is a small, tablet-friendly household planner that runs in a browser and saves data locally on the device.

## Included in this first version

- Weekly overview with automatic current-week positioning
- One-time tasks, weekly tasks, biweekly tasks, and monthly tasks
- Use-by reminders for food or other time-sensitive items
- Assignee selection: both, me, or partner
- To-do list and grocery list
- Completion and undo for scheduled tasks
- Backup download and restore from Settings
- Offline shell through the included service worker when served over HTTPS

## Open it locally

For a quick test, open `index.html` in a modern browser. The app uses `localStorage`, so the lists are stored in that browser on that device.

To preview it on an iPad connected to the same Wi-Fi as the computer, run `node preview-server.cjs` in this folder and open the printed address in Safari. The computer must keep that command running while you test.

For the installable/offline PWA behavior, serve this folder from an HTTPS host (or a local development server) and use the browser's “Add to home screen” option on the tablet.

## Optional phone/tablet cloud sync

Homeboard remains local-first, but it can also sync through Supabase. Create a free Supabase project, run [`supabase-setup.sql`](supabase-setup.sql) once in its SQL Editor, then enter the project URL and publishable key in Homeboard Settings. Use the same Homeboard email and password on each device. The app keeps local saving enabled and merges new items before uploading them.

## Important storage note

This is intentionally local-first: no account, server, or paid service is required for the basic planner. Clearing the browser's site data can remove the planner, so use Settings → Download backup occasionally. Cloud sync is optional and uses the setup described above.

## Publish free with GitHub Pages

1. Create a public GitHub repository, for example `homeboard`.
2. Upload the app files from this folder to the repository's root.
3. In the repository, open **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**, select `main` and `/ (root)`, then save.
5. GitHub will publish a URL such as `https://YOUR-USERNAME.github.io/homeboard/`.

The repository contains only the app source. Household items are saved in each device's browser and are not uploaded to GitHub.
