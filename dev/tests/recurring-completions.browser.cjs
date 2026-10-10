// Synthetic local browser regressions. Every request is intercepted; no real
// account, Supabase project, household data, or deployed site is accessed.
// Run with: node --test tests/recurring-completions.browser.cjs
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const origin = 'http://localhost:4173';
const project = 'https://recurrence-test.supabase.co';
const now = '2026-10-09T12:00:00+02:00';
const assets = new Set(['index.html', 'app.js', 'recurrence.js', 'planner-features.js', 'customer.js', 'styles.css', 'manifest.webmanifest', 'assets/homeboard-banner.png', 'assets/homeboard-icon-192.png', 'assets/homeboard-icon-512.png', 'assets/homeboard-icon-180.png']);
let browser;
before(async () => { browser = await chromium.launch({ headless: true, channel: process.platform === 'win32' ? 'msedge' : undefined }); });
after(async () => { await browser?.close(); });

function task(id = 'laundry-one', changes = {}) {
  return { id, title: 'Laundry', anyDay: true, anyDayDate: '2026-10-05', nextAnyDayDate: '2026-10-05',
    recurrence: 'weekly', recurrenceStartWeek: '2026-10-05', recurrenceStartDate: '2026-10-05',
    assignee: 'me', kind: 'task', updatedAt: '2026-10-05T08:00:00Z', ...changes };
}
function planner(tasks, history = []) {
  return { tasks, anyDayCompletions: history, todos: [], groceries: [], completions: {}, daySettings: {},
    meta: { demo: false, footballScheduleVersion: '20260922-v1' } };
}
function legacyCompletion(id = 'laundry-one') {
  return { id: 'legacy-done-' + id, taskId: id, title: 'Laundry', assignee: 'me',
    completedDate: '2026-10-07', completedAt: '2026-10-07T09:00:00Z', updatedAt: '2026-10-07T09:00:00Z' };
}
async function setup(t, data = planner([task()])) {
  const context = await browser.newContext({ serviceWorkers: 'block', timezoneId: 'Europe/Amsterdam', viewport: { width: 1366, height: 900 } });
  t.after(() => context.close());
  const errors = [];
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  t.after(() => assert.deepEqual(errors, [], 'No browser runtime errors'));
  const cloud = { data: structuredClone(data), offline: false, reads: 0 };
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === origin) {
      const file = url.pathname.slice(1) || 'index.html';
      if (!assets.has(file)) return route.abort();
      return route.fulfill({ status: 200, contentType: ({ '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.png': 'image/png' })[path.extname(file)] || 'application/json', body: fs.readFileSync(path.join(root, file)) });
    }
    if (url.origin !== project) return route.abort();
    if (cloud.offline) return route.abort('internetdisconnected');
    let body = [];
    if (url.pathname === '/rest/v1/planner_documents') {
      if (request.method() === 'GET') { cloud.reads += 1; body = [{ data: structuredClone(cloud.data) }]; }
      else { const payload = request.postDataJSON(); cloud.data = structuredClone(Array.isArray(payload) ? payload[0].data : payload.data); }
    }
    if (url.pathname.endsWith('/is_platform_admin')) body = false;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await context.addInitScript(({ data, now, origin, project }) => {
    const NativeDate = Date;
    window.__recurringTestNow = NativeDate.parse(now);
    window.Date = class extends NativeDate {
      constructor(...args) { super(...(args.length ? args : [window.__recurringTestNow])); }
      static now() { return window.__recurringTestNow; }
    };
    if (location.origin !== origin || localStorage.getItem('recurrence-test-initialized')) return;
    localStorage.setItem('recurrence-test-initialized', 'true');
    localStorage.setItem('homeboard-household-planner-v1', JSON.stringify(data));
    localStorage.setItem('homeboard-sync-config-v1', JSON.stringify({ url: project, key: 'synthetic-public-key' }));
    // Offline/reconnect cases belong to an already signed-in account. They
    // must not rely on importing an unassigned device board during sign-in.
    const user = { id: 'synthetic-recurring-user', email: 'synthetic@example.invalid' };
    const scope = encodeURIComponent(JSON.stringify([project, user.id, null]));
    localStorage.setItem(`homeboard-household-planner-v1:scope:${scope}`, JSON.stringify(data));
    localStorage.setItem('homeboard-sync-session-v1', JSON.stringify({ user, access_token: 'synthetic-access', refresh_token: 'synthetic-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600 }));
  }, { data, now, origin, project });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  await page.goto(origin);
  await page.waitForFunction(() => householdState.loaded && !syncState.busy);
  return { page, context, cloud };
}
const openChecks = (page, id = 'laundry-one') => page.locator(`#anyDayBoard .task-check[data-task-id="${id}"]`);
const doneItems = page => page.locator('#completedAnyDayBoard .completed-any-day-item');
async function sync(page) {
  await page.evaluate(async () => {
    if (!syncState.session) setSyncSession({ user: { id: 'synthetic-recurring-user', email: 'synthetic@example.invalid' },
      access_token: 'synthetic-access', refresh_token: 'synthetic-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600 });
    await syncNow(false);
  });
  await page.waitForFunction(() => !syncState.busy);
}

test('completed recurring chores stay out of the top row after reload and reopening the board', async t => {
  const { page, context } = await setup(t);
  await openChecks(page).click();
  assert.equal(await openChecks(page).count(), 0);
  assert.equal(await doneItems(page).count(), 1);
  await page.reload();
  assert.equal(await openChecks(page).count(), 0);
  assert.equal(await doneItems(page).count(), 1);
  await page.close();
  const reopened = await context.newPage();
  await reopened.goto(origin);
  assert.equal(await openChecks(reopened).count(), 0);
  assert.equal(await doneItems(reopened).count(), 1);
});

test('a newer stale cloud task cannot reopen a completed occurrence after offline reconnection', async t => {
  const { page, cloud } = await setup(t);
  await openChecks(page).click();
  cloud.offline = true;
  await sync(page);
  cloud.data = planner([task('laundry-one', { updatedAt: '2026-10-09T10:01:00Z' })]);
  cloud.offline = false;
  await sync(page);
  assert.ok(cloud.reads > 0, 'The real sync path fetched the synthetic stale document');
  assert.equal(await doneItems(page).count(), 1, 'The completion history survives merging');
  assert.equal(await openChecks(page).count(), 0, 'A later task edit must not erase the completed occurrence');
  await page.reload();
  await page.waitForFunction(() => !syncState.busy);
  assert.equal(await openChecks(page).count(), 0);
});

test('legacy done history repairs a regressed recurring due date without hiding another task with the same title', async t => {
  const { page } = await setup(t, planner([task(), task('laundry-two')], [legacyCompletion()]));
  assert.equal(await doneItems(page).count(), 1);
  assert.equal(await openChecks(page).count(), 0, 'The historical completed task must not reappear');
  assert.equal(await openChecks(page, 'laundry-two').count(), 1, 'The second weekly occurrence remains open');
});

test('editing a completed recurring task title preserves completion and its next due date', async t => {
  const { page } = await setup(t);
  await openChecks(page).click();
  await page.locator('#taskOverviewButton').click();
  await page.locator('.task-overview-item').filter({ hasText: 'Laundry' }).click();
  await page.locator('#taskTitle').fill('Laundry and folding');
  await page.locator('#saveEventButton').click();
  assert.equal(await doneItems(page).count(), 1);
  assert.equal(await openChecks(page).count(), 0, 'Saving a title edit must not reset recurrence progress');
  assert.equal(await page.evaluate(() => state.data.tasks[0].nextAnyDayDate), '2026-10-12');
});

test('completing one of two weekly chores with the same title leaves exactly the other occurrence', async t => {
  const { page } = await setup(t, planner([task(), task('laundry-two')]));
  assert.equal(await page.locator('#anyDayBoard .task-check').count(), 2);
  await openChecks(page).click();
  assert.equal(await openChecks(page).count(), 0);
  assert.equal(await openChecks(page, 'laundry-two').count(), 1);
  assert.equal(await doneItems(page).count(), 1);
  await openChecks(page, 'laundry-two').click();
  assert.equal(await page.locator('#anyDayBoard .task-check').count(), 0);
  assert.equal(await doneItems(page).count(), 2);
  await page.reload();
  assert.equal(await page.locator('#anyDayBoard .task-check').count(), 0);
});

test('Undo survives synchronization with a stale completed document and reloading', async t => {
  const { page, cloud } = await setup(t);
  await openChecks(page).click();
  cloud.data = await page.evaluate(() => JSON.parse(JSON.stringify(state.data)));
  await page.evaluate(() => { window.__recurringTestNow += 1000; });
  await page.locator('#toastAction').click();
  assert.equal(await openChecks(page).count(), 1);
  assert.equal(await doneItems(page).count(), 0);
  await sync(page);
  assert.equal(await doneItems(page).count(), 0, 'A stale synced completion must not reverse Undo');
  assert.equal(await openChecks(page).count(), 1);
  await page.reload();
  await page.waitForFunction(() => !syncState.busy);
  assert.equal(await doneItems(page).count(), 0);
  assert.equal(await openChecks(page).count(), 1);
});

test('Undo updates the live task after synchronization has replaced its object', async t => {
  const { page, cloud } = await setup(t);
  await openChecks(page).click();
  await page.evaluate(() => { window.__taskBeforeSync = state.data.tasks[0]; });
  cloud.data = await page.evaluate(() => JSON.parse(JSON.stringify(state.data)));
  cloud.data.tasks[0].title = 'Laundry renamed on another device';
  cloud.data.tasks[0].updatedAt = '2026-10-09T10:00:00.500Z';
  await sync(page);
  assert.equal(await page.evaluate(() => state.data.tasks[0] === window.__taskBeforeSync), false, 'Sync replaced the task object');
  await page.evaluate(() => { window.__recurringTestNow += 1000; });
  await page.locator('#toastAction').click();
  assert.equal(await doneItems(page).count(), 0);
  assert.equal(await openChecks(page).count(), 1, 'Undo restores the live task, not a stale object');
  assert.match(await page.locator('#anyDayBoard').innerText(), /renamed on another device/);
  await sync(page);
  assert.equal(await doneItems(page).count(), 0);
  assert.equal(await openChecks(page).count(), 1);
});

test('re-completing immediately after Undo survives its older deletion marker', async t => {
  const { page, cloud } = await setup(t);
  await openChecks(page).click();
  await page.locator('#toastAction').click();
  cloud.data = await page.evaluate(() => JSON.parse(JSON.stringify(state.data)));
  // Keep the clock fixed: fast Undo/re-complete must also work in one millisecond.
  await openChecks(page).click();
  await sync(page);
  assert.equal(await doneItems(page).count(), 1);
  assert.equal(await openChecks(page).count(), 0);
  await page.reload();
  await page.waitForFunction(() => !syncState.busy);
  assert.equal(await doneItems(page).count(), 1);
  assert.equal(await openChecks(page).count(), 0);
});

test('a second immediate Undo stays undone when the re-completed history is synced back', async t => {
  const { page, cloud } = await setup(t);
  await openChecks(page).click();
  await page.locator('#toastAction').click();
  await openChecks(page).click();
  cloud.data = await page.evaluate(() => JSON.parse(JSON.stringify(state.data)));
  await page.locator('#toastAction').click();
  await sync(page);
  assert.equal(await doneItems(page).count(), 0, 'The second Undo must outrank the newer completion even in the same millisecond');
  assert.equal(await openChecks(page).count(), 1);
});

test('a repeated completion event cannot complete the next weekly occurrence or duplicate history', async t => {
  const { page } = await setup(t);
  await page.evaluate(() => {
    const checkbox = document.querySelector('#anyDayBoard .task-check');
    checkbox.click();
    // A queued duplicate event still references the now-detached checkbox.
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
  });
  assert.equal(await doneItems(page).count(), 1);
  assert.equal(await openChecks(page).count(), 0);
  await page.locator('#nextWeekButton').click();
  assert.equal(await openChecks(page).count(), 1, 'The second event must not skip next week');
});

test('an explicit schedule change uses new completions and resists stale due-date merges', async t => {
  const { page, cloud } = await setup(t);
  await openChecks(page).click();
  await page.evaluate(() => { window.__recurringTestNow += 1000; });
  await page.locator('#taskOverviewButton').click();
  await page.locator('.task-overview-item').filter({ hasText: 'Laundry' }).click();
  await page.locator('#taskRepeat').selectOption('monthly');
  await page.locator('#saveEventButton').click();
  assert.equal(await openChecks(page).count(), 1, 'Explicitly changing the schedule starts its new occurrence');
  cloud.data = await page.evaluate(() => JSON.parse(JSON.stringify(state.data)));
  cloud.data.tasks[0].updatedAt = '2026-10-09T10:00:01.500Z';
  // Schedule edit and completion deliberately have the same clock timestamp.
  await openChecks(page).click();
  assert.equal(await doneItems(page).count(), 2, 'Both historical actions remain visible');
  await sync(page);
  assert.equal(await openChecks(page).count(), 0, 'Only the new monthly completion advances the new schedule');
  assert.equal(await page.evaluate(() => state.data.tasks[0].nextAnyDayDate), '2026-11-05');
  await page.locator('#nextWeekButton').click();
  assert.equal(await openChecks(page).count(), 0, 'The previous weekly schedule must not return');
});

test('resetting a monthly start week immediately after completion honors the new start date', async t => {
  const { page } = await setup(t, planner([task('laundry-one', { recurrence: 'monthly' })]));
  await openChecks(page).click();
  assert.equal(await page.evaluate(() => state.data.tasks[0].nextAnyDayDate), '2026-11-05');
  // Do not advance the clock: the explicit reset must outrank completion even
  // when its monotonic completion timestamp was already one millisecond ahead.
  await page.locator('#taskOverviewButton').click();
  await page.locator('.task-overview-item').filter({ hasText: 'Laundry' }).click();
  await page.locator('#taskStartWeek').fill('2026-10-12');
  await page.locator('#saveEventButton').click();
  assert.equal(await page.evaluate(() => state.data.tasks[0].nextAnyDayDate), '2026-10-12', 'Old monthly history must not advance the explicitly reset schedule');
  assert.equal(await doneItems(page).count(), 1, 'The historical completion remains recorded');
  assert.equal(await openChecks(page).count(), 0, 'The new schedule starts next week');
  await page.locator('#nextWeekButton').click();
  assert.equal(await openChecks(page).count(), 1);
});

test('restoring a JSON backup reconciles legacy done history before displaying and reloading it', async t => {
  const { page } = await setup(t, planner([]));
  const backup = planner([task(), task('laundry-two')], [legacyCompletion()]);
  await page.locator('#settingsButton').click();
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#importInput').setInputFiles({ name: 'synthetic-recurring-backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  await page.waitForFunction(() => document.querySelector('#toast').textContent === 'Backup restored');
  assert.equal(await doneItems(page).count(), 1);
  assert.equal(await openChecks(page).count(), 0);
  assert.equal(await openChecks(page, 'laundry-two').count(), 1);
  await page.reload();
  assert.equal(await doneItems(page).count(), 1);
  assert.equal(await openChecks(page).count(), 0);
  assert.equal(await openChecks(page, 'laundry-two').count(), 1);
});

test('real clock rollover makes the next weekly occurrence available without bringing longer intervals forward', async t => {
  const { page } = await setup(t, planner([
    task('weekly'), task('biweekly', { recurrence: 'biweekly' }), task('monthly', { recurrence: 'monthly' }),
  ]));
  for (const id of ['weekly', 'biweekly', 'monthly']) await openChecks(page, id).click();
  await page.evaluate(() => {
    window.__recurringTestNow += 7 * 86400000;
    state.weekStart = startOfWeek(new Date());
    render();
  });
  assert.equal(await openChecks(page, 'weekly').count(), 1);
  assert.equal(await openChecks(page, 'biweekly').count(), 0);
  assert.equal(await openChecks(page, 'monthly').count(), 0);
  assert.equal(await doneItems(page).count(), 0, 'Last week\'s history stays in last week');
  await openChecks(page, 'weekly').click();
  assert.equal(await openChecks(page, 'weekly').count(), 0);
  assert.equal(await doneItems(page).count(), 1);
  await page.evaluate(() => {
    window.__recurringTestNow += 7 * 86400000;
    state.weekStart = startOfWeek(new Date());
    render();
  });
  assert.equal(await openChecks(page, 'weekly').count(), 1);
  assert.equal(await openChecks(page, 'biweekly').count(), 1);
  assert.equal(await openChecks(page, 'monthly').count(), 0);
});

test('weekly, biweekly and monthly chores return only in their next scheduled week', async t => {
  const { page } = await setup(t, planner([
    task('weekly', { title: 'Weekly chore' }),
    task('biweekly', { title: 'Biweekly chore', recurrence: 'biweekly' }),
    task('monthly', { title: 'Monthly chore', recurrence: 'monthly' }),
  ]));
  for (const id of ['weekly', 'biweekly', 'monthly']) await openChecks(page, id).click();
  assert.equal(await page.locator('#anyDayBoard .task-check').count(), 0);
  await page.locator('#nextWeekButton').click();
  assert.equal(await openChecks(page, 'weekly').count(), 1);
  assert.equal(await openChecks(page, 'biweekly').count(), 0);
  assert.equal(await openChecks(page, 'monthly').count(), 0);
  await page.locator('#nextWeekButton').click();
  assert.equal(await openChecks(page, 'biweekly').count(), 1);
  assert.equal(await openChecks(page, 'monthly').count(), 0);
  await page.locator('#nextWeekButton').click();
  assert.equal(await openChecks(page, 'monthly').count(), 0);
  await page.locator('#nextWeekButton').click();
  assert.equal(await openChecks(page, 'monthly').count(), 1);
});
