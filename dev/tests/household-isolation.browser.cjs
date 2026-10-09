// Real browser state transitions against synthetic, intercepted cloud responses.
// No live account, household or database is accessed.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const origin = 'http://localhost:4173';
const project = 'https://household-test.supabase.co';
const assets = new Set(['index.html', 'app.js', 'recurrence.js', 'styles.css', 'privacy.html', 'manifest.webmanifest', 'assets/homeboard-banner.png']);
const user = { id: 'synthetic-owner', email: 'owner@example.invalid' };
const home = (id, name = id) => ({ household_id: id, household_name: name, role: 'owner' });
const data = label => ({ tasks: [], todos: label ? [{ id: label, title: label, completed: false, updatedAt: '2026-10-09T12:00:00Z' }] : [],
  groceries: [], completions: {}, anyDayCompletions: [], daySettings: {}, meta: { demo: false, footballScheduleVersion: '20260922-v1', volunteeringStartFixVersion: '20260923-v2' } });
let browser;
before(async () => { browser = await chromium.launch({ headless: true, channel: process.platform === 'win32' ? 'msedge' : undefined }); });
after(async () => { await browser?.close(); });

async function setup(t, options = {}) {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  t.after(() => context.close());
  const errors = [];
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  t.after(() => assert.deepEqual(errors, [], 'No browser runtime errors'));
  const cloud = { households: [home('shared'), home('empty')], docs: { shared: data('Shared original'), empty: {}, joined: data('Invited planner') },
    private: data('Private account item'), requests: [], offline: false, intercept: null, ...options.cloud };
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin === origin) {
      const file = url.pathname.slice(1) || 'index.html';
      if (!assets.has(file)) return route.abort();
      return route.fulfill({ contentType: ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' })[path.extname(file)] || 'application/json', body: fs.readFileSync(path.join(root, file)) });
    }
    if (url.origin !== project) return route.abort();
    const r = { path: url.pathname, method: request.method(), body: request.postDataJSON(), household: (url.searchParams.get('household_id') || '').replace(/^eq\./, '') };
    cloud.requests.push(r);
    if (cloud.offline) return route.abort('internetdisconnected');
    if (cloud.intercept && await cloud.intercept(route, r)) return;
    let body = [];
    if (r.path.endsWith('/list_my_households')) body = structuredClone(cloud.households);
    if (r.path.endsWith('/is_platform_admin')) body = false;
    if (r.path.endsWith('/create_household')) {
      body = 'created'; cloud.households.push(home('created', r.body.household_name)); cloud.docs.created = {};
    }
    if (r.path.endsWith('/accept_household_invitation')) { cloud.households.push(home('joined')); body = [home('joined')]; }
    if (r.path === '/rest/v1/household_documents') {
      if (r.method === 'GET') body = r.household in cloud.docs ? [{ household_id: r.household, data: structuredClone(cloud.docs[r.household]) }] : [];
      else cloud.docs[r.household] = structuredClone(r.body.data);
    }
    if (r.path === '/rest/v1/planner_documents') {
      if (r.method === 'GET') body = [{ data: structuredClone(cloud.private) }];
      else cloud.private = structuredClone(r.body[0].data);
    }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
  });
  await context.addInitScript(({ origin, project, user, legacy }) => {
    if (location.origin !== origin || localStorage.getItem('isolation-initialized')) return;
    localStorage.setItem('isolation-initialized', 'true');
    localStorage.setItem('homeboard-sync-config-v1', JSON.stringify({ url: project, key: 'synthetic-key' }));
    localStorage.setItem('homeboard-sync-session-v1', JSON.stringify({ user, access_token: 'synthetic-access', refresh_token: 'synthetic-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600 }));
    localStorage.setItem('homeboard-household-selection-v1', 'shared');
    localStorage.setItem('homeboard-household-planner-v1', JSON.stringify(legacy));
  }, { origin, project, user, legacy: options.legacy || data('Shared original') });
  const page = await context.newPage(); page.setDefaultTimeout(10000);
  await page.goto(origin);
  await page.waitForFunction(() => document.querySelector('#syncStatus').textContent.includes('synced just now'));
  await page.locator('#settingsButton').click();
  return { page, context, cloud };
}
const titles = page => page.evaluate(() => state.data.todos.map(item => item.title));
const synced = page => page.evaluate(async () => { await syncNow(false); });
async function select(page, id) {
  await page.locator('#householdSelect').selectOption(id);
  await page.waitForFunction(id => householdState.selectedHouseholdId === id && !syncState.busy, id);
  await synced(page);
}

test('creating a household selects it immediately and starts empty without copying private or shared items', async t => {
  const { page, cloud } = await setup(t);
  await page.locator('#householdNameInput').fill('Fresh home');
  await page.locator('#createHouseholdButton').click();
  await page.waitForFunction(() => document.querySelector('#householdStatus').textContent.includes('Household created'));
  assert.equal(await page.locator('#householdSelect').inputValue(), 'created');
  await synced(page);
  assert.deepEqual(await titles(page), []);
  assert.equal(cloud.docs.shared.todos[0].title, 'Shared original');
  assert.equal(cloud.requests.some(r => r.path === '/rest/v1/planner_documents'), false);
  await page.reload(); await page.waitForFunction(() => !syncState.busy && householdState.loaded);
  assert.deepEqual(await page.evaluate(() => [state.data.tasks, state.data.todos, state.data.groceries]), [[], [], []]);
});

test('switching, editing, reload and separate tabs keep household data and deletion markers separate', async t => {
  const { page, context, cloud } = await setup(t);
  await select(page, 'empty');
  assert.deepEqual(await titles(page), []);
  await page.locator('#closeSettingsButton').click();
  await page.locator('#todoInput').fill('Solo only'); await page.locator('#todoForm').evaluate(form => form.requestSubmit());
  await synced(page);
  assert.deepEqual(cloud.docs.empty.todos.map(x => x.title), ['Solo only']);
  await page.locator('#settingsButton').click(); await select(page, 'shared');
  assert.deepEqual(await titles(page), ['Shared original']);
  const other = await context.newPage(); await other.goto(origin);
  await other.waitForFunction(() => householdState.loaded && !syncState.busy);
  await other.locator('#settingsButton').click(); await select(other, 'empty');
  await page.evaluate(() => { markDeleted('todos', 'Shared original'); state.data.todos = []; persist(); });
  await synced(page); await synced(other);
  assert.deepEqual(cloud.docs.shared.todos, []);
  assert.deepEqual(cloud.docs.empty.todos.map(x => x.title), ['Solo only']);
  assert.equal(Boolean(cloud.docs.empty.meta.deleted?.todos?.['Shared original']), false);
  await other.reload(); await other.waitForFunction(() => householdState.loaded && !syncState.busy);
  assert.deepEqual(await titles(other), ['Solo only']);
});

test('accepting an invitation loads only the invited planner and clears previous undo/editor state', async t => {
  const { page, cloud } = await setup(t);
  await page.evaluate(() => { state.lastUndo = { label: 'old', action: () => { state.data.todos.push({ title: 'Old undo' }); } }; editingTaskId = 'old-task'; });
  await page.locator('#inviteTokenInput').fill('synthetic-invitation'); await page.locator('#acceptInvitationButton').click();
  await page.waitForFunction(() => document.querySelector('#householdStatus').textContent.includes('Invitation accepted'));
  await synced(page);
  assert.equal(await page.locator('#householdSelect').inputValue(), 'joined');
  assert.deepEqual(await titles(page), ['Invited planner']);
  assert.equal(await page.evaluate(() => state.lastUndo), null);
  assert.equal(await page.evaluate(() => editingTaskId), null);
  assert.deepEqual(cloud.docs.shared.todos.map(x => x.title), ['Shared original']);
});

test('a delayed sync from the previous household cannot populate or overwrite the newly selected one', async t => {
  const { page, cloud } = await setup(t);
  let release, began;
  const gate = new Promise(resolve => { release = resolve; }), started = new Promise(resolve => { began = resolve; });
  let held = false;
  cloud.intercept = async (route, r) => {
    if (held || r.household !== 'shared' || r.method !== 'GET') return false;
    held = true; began(); await gate;
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify([{ data: data('Late shared item') }]) }); return true;
  };
  await page.evaluate(() => { void syncNow(false); }); await started;
  await page.locator('#householdSelect').selectOption('empty');
  assert.deepEqual(await titles(page), []);
  release(); await page.waitForFunction(() => !syncState.busy);
  await synced(page);
  assert.deepEqual(await titles(page), []);
  assert.equal(JSON.stringify(cloud.docs.empty).includes('Late shared item'), false);
});

test('offline edits stay with their household and survive switching back and reconnecting', async t => {
  const { page, cloud } = await setup(t);
  await select(page, 'empty'); await select(page, 'shared'); cloud.offline = true;
  await page.evaluate(() => { state.data.todos.push({ id: 'offline', title: 'Offline shared', updatedAt: new Date().toISOString() }); persist(); });
  await select(page, 'empty'); assert.deepEqual(await titles(page), []);
  await select(page, 'shared'); assert.deepEqual((await titles(page)).sort(), ['Offline shared', 'Shared original']);
  cloud.offline = false; await synced(page);
  assert.deepEqual(cloud.docs.shared.todos.map(x => x.title).sort(), ['Offline shared', 'Shared original']);
  assert.equal(JSON.stringify(cloud.docs.empty).includes('Offline shared'), false);
});

test('missing, invalid or failed household reads never fall back to private data or overwrite the household', async t => {
  const { page, cloud } = await setup(t);
  for (const mode of ['missing', 'invalid', 'failure']) {
    await select(page, 'shared');
    const writes = cloud.requests.filter(r => r.household === 'empty' && r.method === 'PATCH').length;
    cloud.intercept = async (route, r) => {
      if (r.household !== 'empty' || r.method !== 'GET') return false;
      await route.fulfill({ status: mode === 'failure' ? 503 : 200, contentType: 'application/json', body: JSON.stringify(mode === 'missing' ? [] : mode === 'invalid' ? [{ data: { corrupt: true } }] : { message: 'Temporarily unavailable' }) }); return true;
    };
    await select(page, 'empty');
    assert.deepEqual(await titles(page), []);
    assert.equal(cloud.requests.filter(r => r.household === 'empty' && r.method === 'PATCH').length, writes);
    cloud.intercept = null;
  }
  cloud.intercept = async (route, r) => {
    if (!r.path.endsWith('/list_my_households')) return false;
    await route.fulfill({ status: 503, body: '{"message":"Households unavailable"}' }); return true;
  };
  await page.evaluate(async () => { await loadHouseholds(true); await syncNow(false); });
  assert.equal(cloud.requests.some(r => r.path === '/rest/v1/planner_documents'), false);
});

test('unassigned legacy device data stays recoverable but is not silently published to a household', async t => {
  const { page, cloud } = await setup(t, { legacy: data('Unassigned old device item') });
  assert.deepEqual(await titles(page), ['Shared original']);
  assert.equal(JSON.stringify(cloud.docs).includes('Unassigned old device item'), false);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem(STORAGE_KEY)).todos[0].title), 'Unassigned old device item');
});

test('signing into another account keeps its private planner separate and returning restores the original household', async t => {
  const { page, cloud } = await setup(t);
  const second = { id: 'synthetic-second', email: 'second@example.invalid' };
  cloud.intercept = async (route, r) => {
    if (r.path !== '/auth/v1/token') return false;
    const identity = r.body.email === second.email ? second : user;
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ user: identity, access_token: `synthetic-${identity.id}`, refresh_token: 'synthetic-refresh', expires_in: 3600 }) }); return true;
  };
  await page.locator('#syncSignOutButton').click();
  cloud.households = []; cloud.private = data('Second account private');
  await page.locator('#syncEmail').fill(second.email); await page.locator('#syncPassword').fill('synthetic-password');
  await page.locator('#syncSignInButton').click();
  await page.waitForFunction(id => syncState.session?.user.id === id && !syncState.authenticating && !syncState.busy, second.id);
  assert.deepEqual(await titles(page), ['Second account private']);
  assert.deepEqual(cloud.private.todos.map(x => x.title), ['Second account private']);
  await page.locator('#syncSignOutButton').click(); cloud.households = [home('shared'), home('empty')];
  await page.locator('#syncEmail').fill(user.email); await page.locator('#syncPassword').fill('synthetic-password');
  await page.locator('#syncSignInButton').click();
  await page.waitForFunction(id => syncState.session?.user.id === id && !syncState.authenticating && !syncState.busy, user.id);
  assert.deepEqual(await titles(page), ['Shared original']);
});

test('losing membership loads the private planner without moving shared items into it', async t => {
  const { page, cloud } = await setup(t);
  cloud.households = [];
  await page.evaluate(async () => { await loadHouseholds(true); await syncNow(false); });
  assert.deepEqual(await titles(page), ['Private account item']);
  assert.deepEqual(cloud.private.todos.map(x => x.title), ['Private account item']);
  assert.deepEqual(cloud.docs.shared.todos.map(x => x.title), ['Shared original']);
});

test('IndexedDB recovers only the selected household and cannot restore an older planner after switching', async t => {
  const { page, cloud } = await setup(t);
  await select(page, 'empty');
  await page.evaluate(() => { state.data.todos.push({ id: 'cached', title: 'Empty home cache', updatedAt: new Date().toISOString() }); persist({ sync: false }); });
  await select(page, 'shared');
  // Flush earlier asynchronous writes, then remove only the second home's
  // localStorage copies so its IndexedDB recovery path is exercised.
  await page.evaluate(async () => {
    await new Promise(resolve => openPlannerDatabase(db => {
      const transaction = db.transaction([IDB_STORE], 'readwrite');
      transaction.oncomplete = () => { db.close(); resolve(); };
    }));
    const scope = plannerScopeFor(syncState.session, 'empty');
    localStorage.removeItem(scopedStorageKey(STORAGE_KEY, scope));
    localStorage.removeItem(scopedStorageKey(BACKUP_STORAGE_KEY, scope));
  });
  // Recovery must finish before merging a cloud snapshot which lacks the
  // unsynced local item, even when the cloud responds immediately.
  await select(page, 'empty'); await page.waitForFunction(() => state.data.todos.some(x => x.title === 'Empty home cache'));
  assert.deepEqual(await titles(page), ['Empty home cache']);
  cloud.offline = true;
  await page.evaluate(() => {
    const scope = plannerScopeFor(syncState.session, 'shared');
    localStorage.removeItem(scopedStorageKey(STORAGE_KEY, scope));
    localStorage.removeItem(scopedStorageKey(BACKUP_STORAGE_KEY, scope));
    const select = document.querySelector('#householdSelect');
    select.value = 'shared'; select.dispatchEvent(new Event('change'));
    select.value = 'empty'; select.dispatchEvent(new Event('change'));
  });
  await page.evaluate(async () => { await new Promise(resolve => openPlannerDatabase(db => { db.close(); resolve(); })); });
  assert.deepEqual(await titles(page), ['Empty home cache']);
  await select(page, 'shared');
  await page.waitForFunction(() => state.data.todos.some(x => x.title === 'Shared original'));
  assert.deepEqual(await titles(page), ['Shared original'], 'Leaving before recovery finishes must not overwrite its cached board with an empty one');
});
