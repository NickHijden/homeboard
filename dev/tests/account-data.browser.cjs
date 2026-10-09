const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const project = 'https://account-test.supabase.co';
const user = { id: 'synthetic-account', email: 'account@example.com' };
const planner = { tasks: [], todos: [{ id: 'todo-one', title: 'Private device item', completed: false }], groceries: [], completions: {}, anyDayCompletions: [], daySettings: {}, meta: { footballScheduleVersion: '20260922-v1', demo: false } };
const preview = { account_id: user.id, email: user.email, platform_admin: false, households: [{ id: 'solo', name: 'Synthetic home', role: 'owner', other_members: 0 }] };
let browser, server, origin;
before(async () => {
  const allowed = new Set(['index.html', 'app.js', 'recurrence.js', 'styles.css', 'privacy.html', 'sw.js', 'manifest.webmanifest', 'assets/homeboard-banner.png']);
  server = http.createServer((req, res) => {
    const file = new URL(req.url, 'http://localhost').pathname.slice(1) || 'index.html';
    if (file === 'cloud-response') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Content-Type', 'application/json');
      return res.end('{"synthetic_private_data":true}');
    }
    if (!allowed.has(file)) return res.writeHead(404).end();
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' })[path.extname(file)] || 'application/json');
    res.end(fs.readFileSync(path.join(root, file)));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://localhost:${server.address().port}`;
  browser = await chromium.launch({ headless: true, channel: process.platform === 'win32' ? 'msedge' : undefined });
});
after(async () => { await browser?.close(); if (server) await new Promise(resolve => server.close(resolve)); });
async function setup(t, options = {}) {
  const context = await browser.newContext({ viewport: options.viewport || { width: 1024, height: 768 }, serviceWorkers: 'block', ...(options.ios ? { userAgent: 'Mozilla/5.0 (iPad; CPU OS 12_5 like Mac OS X) AppleWebKit/605.1.15 Version/12.0 Mobile/15E148 Safari/604.1' } : {}) });
  t.after(() => context.close());
  const requests = [];
  await context.route('**/*', async (route) => {
    const request = route.request();
    if (request.url().startsWith(origin)) return route.continue();
    if (!request.url().startsWith(project)) return route.abort();
    const record = { url: request.url(), method: request.method(), body: request.postDataJSON() };
    requests.push(record);
    if (options.respond && await options.respond(route, record)) return;
    let data = [];
    if (record.url.endsWith('/preview_my_account_deletion')) data = options.preview || preview;
    if (record.url.endsWith('/export_my_account_data')) data = { format: 'homeboard-account-export', version: 1, account: user, households: [{ name: 'Shared', planner: { tasks: [] } }] };
    if (record.url.endsWith('/delete-account')) data = { deleted: true, account_id: user.id };
    if (record.url.endsWith('/is_platform_admin')) data = false;
    if (record.url.includes('/planner_documents?')) data = [{ data: planner }];
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
  });
  await context.addInitScript(({ project, planner, user, origin }) => {
    if (location.origin !== origin) return;
    if (localStorage.getItem('account-test-initialized')) return;
    localStorage.setItem('account-test-initialized', 'true');
    localStorage.setItem('homeboard-sync-config-v1', JSON.stringify({ url: project, key: 'synthetic-public-key' }));
    localStorage.setItem('homeboard-sync-session-v1', JSON.stringify({ user, access_token: 'synthetic-access', refresh_token: 'synthetic-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600 }));
    localStorage.setItem('homeboard-sync-email-v1', user.email);
    localStorage.setItem('homeboard-household-planner-v1', JSON.stringify(planner));
    localStorage.setItem('homeboard-data', JSON.stringify(planner));
    localStorage.setItem('homeboard-household-planner-v1-staging', 'unrelated environment');
  }, { project, planner, user, origin });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const errors = [];
  context.on('page', p => p.on('pageerror', e => errors.push(e.message)));
  page.on('pageerror', e => errors.push(e.message));
  t.after(() => assert.deepEqual(errors, []));
  await page.goto(origin);
  await page.waitForFunction(() => document.querySelector('#syncStatus').textContent.includes('Synced just now'));
  await page.locator('#settingsButton').click();
  await page.locator('#advancedAccountOptions > summary').click();
  return { page, context, requests };
}
async function review(page) {
  await page.locator('#deleteAccountButton').click();
  await page.waitForFunction(() => !document.querySelector('#deleteAccountConfirmation').hidden);
}
async function confirm(page) {
  await page.locator('#deleteAccountPassword').fill('synthetic-password');
  await page.locator('#deleteAccountPhrase').fill('DELETE');
  await page.locator('#confirmDeleteAccountButton').click();
}
test('account export downloads server data and includes device data only when requested', async t => {
  const { page } = await setup(t);
  for (const include of [false, true]) {
    await page.locator('#includeDeviceData').setChecked(include);
    const downloaded = page.waitForEvent('download');
    await page.locator('#exportAccountButton').click();
    const file = await downloaded;
    assert.match(file.suggestedFilename(), /^homeboard-account-export-.*\.json$/);
    const data = JSON.parse(fs.readFileSync(await file.path(), 'utf8'));
    assert.equal(data.account.id, user.id);
    assert.equal(Boolean(data.device_planner), include);
    assert.doesNotMatch(JSON.stringify(data), /synthetic-access|synthetic-refresh|synthetic-password/);
  }
});
test('iPad export has a copy fallback and failed cloud export does not produce a partial file', async t => {
  const { page } = await setup(t, { ios: true });
  await page.locator('#exportAccountButton').click();
  await page.locator('#backupDialog').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#backupTitle').textContent(), 'Copy your account export');
  assert.equal(JSON.parse(await page.locator('#backupText').inputValue()).account.id, user.id);
  await page.locator('#closeBackupButton').click();
  await page.route('**/export_my_account_data', route => route.fulfill({ status: 503, body: '{"message":"Offline"}' }));
  await page.locator('#exportAccountButton').click();
  await page.waitForFunction(() => document.querySelector('#accountDataStatus').textContent === 'Offline');
  assert.equal(await page.locator('#backupDialog').isVisible(), false);
});
test('shared owners and platform admins are blocked before password confirmation', async t => {
  for (const blocked of [{ ...preview, platform_admin: true }, { ...preview, households: [{ ...preview.households[0], other_members: 1 }] }]) {
    const { page, requests } = await setup(t, { preview: blocked });
    await page.locator('#deleteAccountButton').click();
    await page.waitForFunction(() => /administrator|Transfer ownership/.test(document.querySelector('#deleteAccountStatus').textContent));
    assert.equal(await page.locator('#deleteAccountConfirmation').isVisible(), false);
    assert.equal(await page.locator('#confirmDeleteAccountButton').isDisabled(), true);
    assert.equal(requests.some(r => r.url.endsWith('/delete-account')), false);
  }
});
test('confirmation is exact, cancel clears password, and preview names are treated as text', async t => {
  const { page, requests } = await setup(t, { preview: { ...preview, households: [{ ...preview.households[0], name: '<img src=x onerror=alert(1)>' }] } });
  await review(page);
  assert.equal(await page.locator('#deleteAccountHouseholds img').count(), 0);
  await page.locator('#deleteAccountPassword').fill('synthetic-password');
  await page.locator('#deleteAccountPhrase').fill('delete');
  assert.equal(await page.locator('#confirmDeleteAccountButton').isDisabled(), true);
  await page.locator('#cancelDeleteAccountButton').click();
  assert.equal(await page.locator('#deleteAccountPassword').inputValue(), '');
  assert.equal(requests.some(r => r.url.endsWith('/delete-account')), false);
});
test('failed deletion preserves planner, does not sign out on a known password failure, and clears the password', async t => {
  const { page } = await setup(t, { respond: async (route, r) => {
    if (!r.url.endsWith('/delete-account')) return false;
    await route.fulfill({ status: 403, contentType: 'application/json', body: '{"message":"Password confirmation failed."}' }); return true;
  } });
  await review(page); await confirm(page);
  await page.waitForFunction(() => document.querySelector('#deleteAccountStatus').textContent.includes('Password confirmation failed'));
  assert.equal(await page.locator('#deleteAccountPassword').inputValue(), '');
  const data = await page.evaluate(() => ({ session: localStorage.getItem(SYNC_SESSION_KEY), data: JSON.parse(localStorage.getItem(scopedStorageKey(STORAGE_KEY, activePlannerScope))) }));
  assert.ok(data.session);
  assert.equal(data.data.todos[0].title, 'Private device item');
});
test('successful deletion clears this environment, other tabs, IndexedDB, and survives reload', async t => {
  let finish;
  const hold = new Promise(resolve => { finish = resolve; });
  const { page, context, requests } = await setup(t, { respond: async (route, r) => {
    if (!r.url.endsWith('/delete-account')) return false;
    await hold;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ deleted: true, account_id: user.id }) }); return true;
  } });
  const other = await context.newPage(); await other.goto(origin);
  await review(page); await confirm(page);
  await page.waitForFunction(() => document.querySelector('#cancelDeleteAccountButton').disabled);
  assert.equal(await page.locator('#confirmDeleteAccountButton').isDisabled(), true);
  finish();
  await page.waitForFunction(() => document.querySelector('#accountDataStatus').textContent.startsWith('Account deleted.'));
  await other.waitForFunction(() => state.data.todos.length === 0 && syncState.session === null);
  assert.equal(requests.filter(r => r.url.endsWith('/delete-account')).length, 1);
  assert.equal(requests.find(r => r.url.endsWith('/delete-account')).body.confirmation, 'DELETE');
  const stored = await page.evaluate(async () => {
    const db = await new Promise(resolve => { const r = indexedDB.open(IDB_NAME); r.onsuccess = () => resolve(r.result); });
    const data = await new Promise(resolve => { const r = db.transaction(IDB_STORE).objectStore(IDB_STORE).get('current'); r.onsuccess = () => resolve(r.result); }); db.close();
    return { session: localStorage.getItem(SYNC_SESSION_KEY), legacy: localStorage.getItem('homeboard-data'), other: localStorage.getItem('homeboard-household-planner-v1-staging'), data,
      remainingScoped: Object.keys(localStorage).filter(key => [STORAGE_KEY, BACKUP_STORAGE_KEY, HOUSEHOLD_SELECTION_KEY].some(base => key.startsWith(`${base}:scope:`))) };
  });
  assert.equal(stored.session, null); assert.equal(stored.legacy, null);
  assert.deepEqual(stored.remainingScoped, [], 'Deletion removes every planner and selection cache in this environment');
  assert.equal(stored.other, 'unrelated environment'); assert.deepEqual(stored.data.data.todos, []);
  await page.reload();
  assert.equal(await page.evaluate(() => state.data.tasks.length + state.data.todos.length + state.data.groceries.length), 0);
  assert.equal(await page.evaluate(() => syncState.session), null);
});
test('an old sync response cannot restore deleted data', async t => {
  let delay = false, finish, started;
  const hold = new Promise(resolve => { finish = resolve; });
  const began = new Promise(resolve => { started = resolve; });
  const { page } = await setup(t, { respond: async (route, r) => {
    if (!delay || !r.url.includes('/planner_documents?')) return false;
    started(); await hold;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ data: planner }]) }); return true;
  } });
  delay = true;
  await page.evaluate(() => { void syncNow(false); }); await began;
  await review(page); await confirm(page);
  await page.waitForFunction(() => document.querySelector('#accountDataStatus').textContent.startsWith('Account deleted.'));
  finish();
  await page.waitForFunction(() => !syncState.busy);
  assert.deepEqual(await page.evaluate(() => state.data.todos), []);
});
test('deletion review and actions fit a short phone screen', async t => {
  const { page } = await setup(t, { viewport: { width: 375, height: 667 } });
  await review(page);
  await page.locator('#deleteAccountPassword').fill('synthetic-password');
  await page.locator('#deleteAccountPhrase').fill('DELETE');
  await page.locator('#confirmDeleteAccountButton').scrollIntoViewIfNeeded();
  const bounds = await page.locator('#confirmDeleteAccountButton').boundingBox();
  assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 375 && bounds.y >= 0 && bounds.y + bounds.height <= 667);
  fs.mkdirSync(path.join(root, 'tmp', 'account-qa'), { recursive: true });
  await page.screenshot({ path: path.join(root, 'tmp', 'account-qa', 'deletion-phone.png') });
});

test('the installed service worker never caches cloud API responses', async t => {
  const context = await browser.newContext({ serviceWorkers: 'allow' });
  t.after(() => context.close());
  const page = await context.newPage();
  await page.goto(origin);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
  });
  const cloudUrl = origin.replace('localhost', '127.0.0.1') + '/cloud-response';
  const result = await page.evaluate(async cloud => {
    const data = await (await fetch(cloud)).json();
    const cached = await caches.match(cloud);
    return { data, cached: Boolean(cached) };
  }, cloudUrl);
  assert.equal(result.data.synthetic_private_data, true);
  assert.equal(result.cached, false);
});
