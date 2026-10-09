// Real browser, synthetic cloud responses only. No live accounts are used.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const origin = 'http://localhost:4173';
const project = 'https://controls-test.supabase.co';
const user = { id: 'synthetic-owner', email: 'owner@example.invalid' };
const home = (id, name = id, role = 'owner') => ({ household_id: id, household_name: name, role });
const data = title => ({ tasks: [], todos: title ? [{ id: title, title, updatedAt: '2026-10-09T12:00:00Z' }] : [], groceries: [], meta: { demo: false } });
let browser;
before(async () => { browser = await chromium.launch({ headless: true, channel: process.platform === 'win32' ? 'msedge' : undefined }); });
after(async () => browser?.close());

async function setup(t, options = {}) {
  const context = await browser.newContext({ serviceWorkers: 'block', viewport: options.viewport || { width: 1100, height: 800 } });
  t.after(() => context.close());
  const errors = []; context.on('page', p => p.on('pageerror', error => errors.push(error.message)));
  t.after(() => assert.deepEqual(errors, []));
  const cloud = { households: [home('one', options.name || 'First home', options.role || 'owner'), home('two', 'Second home')],
    docs: { one: data('First task'), two: data('Second task') }, requests: [], offline: false, intercept: null };
  await context.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.origin === origin) {
      const file = url.pathname.slice(1) || 'index.html';
      if (!['index.html', 'app.js', 'recurrence.js', 'styles.css', 'manifest.webmanifest', 'assets/homeboard-banner.png'].includes(file)) return route.abort();
      return route.fulfill({ contentType: ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' })[path.extname(file)] || 'application/json', body: fs.readFileSync(path.join(root, file)) });
    }
    if (url.origin !== project) return route.abort();
    const r = { path: url.pathname, search: url.search, method: req.method(), body: req.postDataJSON(), headers: req.headers(), household: (url.searchParams.get('household_id') || '').replace(/^eq\./, '') };
    cloud.requests.push(r);
    if (cloud.offline) return route.abort('internetdisconnected');
    if (cloud.intercept && await cloud.intercept(route, r)) return;
    let body = [];
    if (r.path.endsWith('/list_my_households')) body = cloud.households;
    if (r.path.endsWith('/is_platform_admin')) body = false;
    if (r.path.endsWith('/delete_my_household')) {
      const selected = cloud.households.find(h => h.household_id === r.body.target_household_id);
      if (!selected || selected.role !== 'owner' || selected.household_name !== r.body.confirmed_household_name) return route.fulfill({ status: 400, contentType: 'application/json', body: '{"message":"Only the current household owner can delete this household."}' });
      cloud.households = cloud.households.filter(h => h !== selected); delete cloud.docs[selected.household_id]; body = true;
    }
    if (r.path === '/rest/v1/household_documents') {
      if (r.method === 'GET') body = cloud.docs[r.household] ? [{ data: cloud.docs[r.household] }] : [];
      else if (cloud.docs[r.household]) cloud.docs[r.household] = r.body.data;
    }
    if (r.path === '/rest/v1/planner_documents') body = [{ data: data('Private task') }];
    if (r.path === '/auth/v1/logout') return route.fulfill({ status: 204 });
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
  });
  await context.addInitScript(({ origin, project, user }) => {
    if (location.origin !== origin || localStorage.getItem('controls-initialized')) return;
    localStorage.setItem('controls-initialized', 'true');
    localStorage.setItem('homeboard-sync-config-v1', JSON.stringify({ url: project, key: 'synthetic-public-key' }));
    localStorage.setItem('homeboard-sync-session-v1', JSON.stringify({ user, access_token: 'synthetic-access', refresh_token: 'synthetic-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600 }));
    localStorage.setItem('homeboard-household-selection-v1', 'one');
  }, { origin, project, user });
  if (options.olderSafari) await context.addInitScript(() => {
    Object.defineProperty(window, 'AbortController', { configurable: true, value: undefined });
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: undefined });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: undefined });
  });
  const page = await context.newPage(); page.setDefaultTimeout(10000);
  await page.goto(origin); await page.waitForFunction(() => householdState.loaded && !syncState.busy);
  await page.locator('#settingsButton').click();
  return { page, context, cloud };
}
async function review(page) {
  await page.locator('#householdOptions summary').click(); await page.locator('#deleteHouseholdButton').click();
}
async function confirm(page, name = 'First home') {
  await page.locator('#deleteHouseholdPhrase').fill(name); await page.locator('#confirmDeleteHouseholdButton').click();
}
const deletes = cloud => cloud.requests.filter(r => r.path.endsWith('/delete_my_household'));
const titles = page => page.evaluate(() => state.data.todos.map(t => t.title));

test('Log out is visible for a signed-in account, revokes only its session and signs out other tabs', async t => {
  const { page, context, cloud } = await setup(t);
  const other = await context.newPage(); await other.goto(origin); await other.waitForFunction(() => householdState.loaded && !syncState.busy);
  assert.equal(await page.locator('#syncSignOutButton').innerText(), 'Log out');
  assert.equal(await page.locator('#signedInEmail').innerText(), user.email);
  assert.equal(await page.locator('#syncPassword').isVisible(), false);
  await page.locator('#syncSignOutButton').click();
  await other.waitForFunction(() => !syncState.session);
  assert.equal(await page.locator('#syncSignInButton').isVisible(), true);
  assert.equal(await page.locator('#syncSignOutButton').isVisible(), false);
  await page.waitForFunction(() => !localStorage.getItem(SYNC_SESSION_KEY));
  const requests = cloud.requests.filter(r => r.path === '/auth/v1/logout');
  assert.equal(requests.length, 1); assert.equal(requests[0].search, '?scope=local');
  assert.equal(requests[0].headers.authorization, 'Bearer synthetic-access');
  assert.equal(requests[0].method, 'POST');
  await page.reload(); assert.equal(await page.evaluate(() => syncState.session), null);
  assert.equal((await titles(page)).includes('First task'), false);
  assert.equal(cloud.docs.one.todos[0].title, 'First task');
});

test('offline logout still removes the login and cannot be undone by a reload', async t => {
  const { page, cloud } = await setup(t); cloud.offline = true;
  await page.locator('#syncSignOutButton').click();
  await page.waitForFunction(() => document.querySelector('#syncStatus').textContent.includes('server could not be reached'));
  await page.reload(); assert.equal(await page.evaluate(() => syncState.session), null);
});

test('calendar and main controls work with older Safari dialog and logout fallbacks', async t => {
  const { page, cloud } = await setup(t, { olderSafari: true, viewport: { width: 1024, height: 768 } });
  assert.equal(await page.locator('#weekGrid .day-name').count(), 7);
  assert.equal(await page.locator('#syncSignOutButton').isVisible(), true);
  await page.locator('#closeSettingsButton').click();
  await page.locator('#taskOverviewButton').click();
  assert.equal(await page.locator('#taskOverviewDialog').isVisible(), true);
  await page.locator('#closeTaskOverviewButton').click();
  await page.locator('#addTaskButton').click();
  assert.equal(await page.locator('#taskDialog').isVisible(), true);
  await page.locator('#closeDialogButton').click();
  await page.locator('#settingsButton').click();
  assert.equal(await page.locator('#settingsDialog').isVisible(), true);
  await review(page);
  assert.equal(await page.locator('#deleteHouseholdDialog').isVisible(), true);
  await confirm(page);
  await page.waitForFunction(() => document.querySelector('#householdStatus').textContent.startsWith('Household deleted.'));
  assert.deepEqual(await titles(page), ['Second task']);
  await page.locator('#syncSignOutButton').click();
  assert.equal(await page.locator('#syncSignInButton').isVisible(), true);
  await page.waitForTimeout(100);
  assert.equal(cloud.requests.filter(r => r.path === '/auth/v1/logout').length, 1);
  await page.reload();
  assert.equal(await page.locator('#weekGrid .day-name').count(), 7);
  await page.locator('#settingsButton').click();
  assert.equal(await page.locator('#syncSignInButton').isVisible(), true);
});

test('members have no delete button and cannot open owner deletion through the UI handler', async t => {
  const { page, cloud } = await setup(t, { role: 'member' });
  assert.equal(await page.locator('#householdOptions').isVisible(), false);
  await page.evaluate(() => reviewHouseholdDeletion());
  assert.equal(await page.locator('#deleteHouseholdDialog').isVisible(), false); assert.equal(deletes(cloud).length, 0);
});

test('confirmation names the household safely, requires exact spelling and cancellation clears the input', async t => {
  const name = '<img src=x onerror=alert(1)> & Home';
  const { page, cloud } = await setup(t, { name }); await review(page);
  assert.equal(await page.locator('#deleteHouseholdName').innerText(), name);
  assert.equal(await page.locator('#deleteHouseholdName img').count(), 0);
  await page.locator('#deleteHouseholdPhrase').fill(name.toLowerCase());
  assert.equal(await page.locator('#confirmDeleteHouseholdButton').isDisabled(), true);
  await page.locator('#deleteHouseholdPhrase').fill(name);
  assert.equal(await page.locator('#confirmDeleteHouseholdButton').isDisabled(), false);
  await page.locator('#cancelDeleteHouseholdButton').click(); await page.locator('#deleteHouseholdButton').click();
  assert.equal(await page.locator('#deleteHouseholdPhrase').inputValue(), '');
  await page.keyboard.press('Escape'); assert.equal(await page.locator('#deleteHouseholdDialog').isVisible(), false);
  assert.equal(deletes(cloud).length, 0); assert.deepEqual(await titles(page), ['First task']);
});

test('server rejection preserves household, cached planner and account', async t => {
  const { page, cloud } = await setup(t);
  cloud.intercept = async (route, r) => {
    if (!r.path.endsWith('/delete_my_household')) return false;
    await route.fulfill({ status: 400, contentType: 'application/json', body: '{"message":"Only the current household owner can delete this household."}' }); return true;
  };
  await review(page); await confirm(page);
  await page.waitForFunction(() => !householdDeleteBusy);
  assert.match(await page.locator('#deleteHouseholdStatus').innerText(), /Only the current household owner/);
  assert.deepEqual(await titles(page), ['First task']); assert.equal(cloud.households.length, 2);
  assert.equal(await page.evaluate(() => syncState.session.user.id), user.id);
});

test('deleting one household clears its local and IndexedDB copies in both tabs while keeping other planners and login', async t => {
  const { page, context, cloud } = await setup(t);
  const other = await context.newPage(); await other.goto(origin); await other.waitForFunction(() => householdState.loaded && !syncState.busy);
  await review(page); await confirm(page);
  await page.waitForFunction(() => document.querySelector('#householdStatus').textContent.startsWith('Household deleted.'));
  await other.waitForFunction(() => householdState.selectedHouseholdId === 'two' && !syncState.busy);
  assert.equal(deletes(cloud).length, 1); assert.deepEqual(deletes(cloud)[0].body, { target_household_id: 'one', confirmed_household_name: 'First home' });
  for (const p of [page, other]) {
    assert.deepEqual(await titles(p), ['Second task']);
    assert.equal(await p.evaluate(() => syncState.session.user.id), user.id);
    assert.equal(await p.evaluate(() => Object.keys(localStorage).some(key => key.startsWith(STORAGE_KEY + ':scope:') && decodeURIComponent(key).includes('"one"'))), false);
  }
  const idbKeys = await page.evaluate(() => new Promise(resolve => openPlannerDatabase(db => {
    const tx = db.transaction([IDB_STORE], 'readonly'); const req = tx.objectStore(IDB_STORE).getAllKeys();
    req.onsuccess = () => { db.close(); resolve(req.result); };
  })));
  assert.equal(idbKeys.some(key => decodeURIComponent(key).includes('"one"')), false);
  assert.equal(cloud.docs.two.todos[0].title, 'Second task');
  await page.reload(); await page.waitForFunction(() => householdState.loaded && !syncState.busy);
  assert.deepEqual(await titles(page), ['Second task']);
});

test('a pending delete cannot be submitted twice and a delayed old sync cannot restore the deleted planner', async t => {
  const { page, cloud } = await setup(t);
  let releaseRead, releaseDelete, readStarted, deleteStarted;
  const readGate = new Promise(r => { releaseRead = r; }), deletionGate = new Promise(r => { releaseDelete = r; });
  const reading = new Promise(r => { readStarted = r; }), deleting = new Promise(r => { deleteStarted = r; });
  let heldRead = false;
  cloud.intercept = async (route, r) => {
    if (r.path.endsWith('/delete_my_household')) { deleteStarted(); await deletionGate; return false; }
    if (!heldRead && r.household === 'one' && r.method === 'GET') {
      heldRead = true; readStarted(); await readGate;
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify([{ data: data('Late deleted task') }]) }); return true;
    }
    return false;
  };
  await page.evaluate(() => { void syncNow(false); }); await reading;
  await review(page); await confirm(page); await deleting;
  await page.locator('#deleteHouseholdForm').evaluate(form => form.dispatchEvent(new Event('submit', { cancelable: true })));
  assert.equal(deletes(cloud).length, 1); assert.equal(await page.locator('#cancelDeleteHouseholdButton').isDisabled(), true);
  releaseDelete(); releaseRead();
  await page.waitForFunction(() => householdState.selectedHouseholdId === 'two' && !syncState.busy && !householdDeleteBusy);
  await page.evaluate(() => syncNow(false));
  assert.deepEqual(await titles(page), ['Second task']); assert.equal(JSON.stringify(cloud.docs.two).includes('Late deleted task'), false);
});

test('deleting the last household returns to the private planner and the confirmation fits a phone', async t => {
  const { page, cloud } = await setup(t, { viewport: { width: 390, height: 844 } });
  cloud.households = cloud.households.slice(0, 1);
  await page.evaluate(() => loadHouseholds(true)); await review(page);
  await page.locator('#cancelDeleteHouseholdButton').scrollIntoViewIfNeeded();
  const box = await page.locator('#deleteHouseholdDialog').boundingBox();
  assert.ok(box.x >= 0 && box.width <= 390 && box.height <= 844);
  if (process.env.HOMEBOARD_QA_SCREENSHOTS) {
    fs.mkdirSync(process.env.HOMEBOARD_QA_SCREENSHOTS, { recursive: true });
    await page.screenshot({ path: path.join(process.env.HOMEBOARD_QA_SCREENSHOTS, 'household-delete-phone.png') });
  }
  await confirm(page);
  await page.waitForFunction(() => document.querySelector('#householdStatus').textContent.startsWith('Household deleted.'));
  assert.equal(await page.evaluate(() => householdState.selectedHouseholdId), '');
  assert.deepEqual(await titles(page), ['Private task']);
  assert.equal(await page.locator('#syncSignOutButton').isVisible(), true);
});
