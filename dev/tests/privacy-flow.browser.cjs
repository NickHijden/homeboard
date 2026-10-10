// Run with: node --test tests/privacy-flow.browser.cjs
// Requires Playwright. On Windows, uses installed Edge by default.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const projectUrl = 'https://privacy-test.supabase.co';
let browser;
let server;
let origin;
const version = fs.readFileSync(path.join(root, 'app.js'), 'utf8')
  .match(/const PRIVACY_TERMS_VERSION = '([^']+)'/)[1];

before(async () => {
  const allowed = new Set(['index.html', 'privacy.html', 'app.js', 'recurrence.js', 'planner-features.js', 'customer.js', 'styles.css', 'sw.js', 'manifest.webmanifest', 'assets/homeboard-banner.png', 'assets/homeboard-icon-192.png', 'assets/homeboard-icon-512.png', 'assets/homeboard-icon-180.png']);
  server = http.createServer((request, response) => {
    let file = new URL(request.url, 'http://localhost').pathname.replace(/^\//, '') || 'index.html';
    if (!allowed.has(file)) { response.writeHead(404).end(); return; }
    const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' }[path.extname(file)];
    response.setHeader('Content-Type', `${type || 'application/json'}; charset=utf-8`);
    response.end(fs.readFileSync(path.join(root, file)));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  // localhost enables the service worker; the server remains loopback-only.
  origin = `http://localhost:${server.address().port}`;
  browser = await chromium.launch({
    headless: true,
    channel: process.env.HOMEBOARD_BROWSER_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined),
  });
});

after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise((resolve) => server.close(resolve));
});

async function setup(t, options = {}) {
  const context = await browser.newContext({ viewport: options.viewport || { width: 1024, height: 768 }, serviceWorkers: 'block' });
  t.after(() => context.close());
  const requests = [];
  await context.route('**/*', async (route) => {
    const request = route.request();
    if (request.url().startsWith(origin)) return route.continue();
    if (request.url().startsWith(projectUrl)) {
      const record = { url: request.url(), body: request.postDataJSON() };
      requests.push(record);
      if (options.respond) return options.respond(route, record);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: { id: 'synthetic-user' } }) });
    }
    return route.abort();
  });
  await context.addInitScript(({ projectUrl }) => {
    localStorage.setItem('homeboard-sync-config-v1', JSON.stringify({ url: projectUrl, key: 'synthetic-publishable-key' }));
    localStorage.setItem('homeboard-household-planner-v1', JSON.stringify({
      tasks: [], todos: [], groceries: [], meta: { demo: false, footballScheduleVersion: '20260922-v1' },
    }));
  }, { projectUrl });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, [], 'No browser runtime errors'));
  await page.goto(origin);
  await page.locator('#settingsButton').click();
  await page.locator('#syncEmail').fill('privacy-test@example.com');
  await page.locator('#syncPassword').fill('synthetic-password');
  return { page, context, requests };
}

test('signup stays local until the user explicitly acknowledges the documents', async (t) => {
  const { page, requests } = await setup(t);
  assert.equal(await page.locator('#signupAcknowledgement').isChecked(), false);
  await page.locator('#syncSignUpButton').click();
  assert.equal(requests.length, 0);
  assert.match(await page.locator('#syncStatus').innerText(), /Read and agree/);
  assert.equal(await page.locator('#signupAcknowledgement').getAttribute('aria-invalid'), 'true');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'signupAcknowledgement');
  await page.locator('#signupAcknowledgement').check();
  assert.equal(await page.locator('#signupAcknowledgement').getAttribute('aria-invalid'), null);
});

test('email-confirmation signup sends versioned acknowledgement and clears sensitive fields', async (t) => {
  const { page, requests } = await setup(t);
  await page.locator('#signupAcknowledgement').check();
  await page.locator('#syncSignUpButton').click();
  await page.waitForFunction(() => document.querySelector('#syncStatus').textContent.includes('Signup request received'));
  assert.equal(requests.length, 1);
  assert.equal(new URL(requests[0].url).pathname, '/auth/v1/signup');
  assert.equal(new URL(requests[0].url).searchParams.get('redirect_to'), origin + '/');
  const acknowledgement = requests[0].body.data.homeboard_acknowledgement;
  assert.equal(acknowledgement.terms_version, version);
  assert.equal(acknowledgement.privacy_notice_version, version);
  assert.equal(acknowledgement.acceptable_use_version, version);
  assert.ok(Math.abs(Date.now() - Date.parse(acknowledgement.acknowledged_at)) < 10000);
  assert.equal(await page.locator('#signupAcknowledgement').isChecked(), false);
  assert.equal(await page.locator('#syncPassword').inputValue(), '');
  assert.equal(await page.locator('#syncSignUpButton').isEnabled(), true);
});

test('existing accounts can sign in without creating an acknowledgement record', async (t) => {
  const { page, requests } = await setup(t, { respond: (route) => route.fulfill({
    status: 400, contentType: 'application/json', body: JSON.stringify({ msg: 'Synthetic sign-in response' }),
  }) });
  await page.locator('#syncSignInButton').click();
  await page.waitForFunction(() => document.querySelector('#syncStatus').textContent === 'Synthetic sign-in response');
  assert.equal(requests.length, 1);
  assert.ok(requests[0].url.endsWith('/auth/v1/token?grant_type=password'));
  assert.deepEqual(requests[0].body, { email: 'privacy-test@example.com', password: 'synthetic-password' });
});

test('failed signup can be retried, but a different email needs a fresh acknowledgement', async (t) => {
  const { page, requests } = await setup(t, { respond: (route) => route.fulfill({
    status: 503, contentType: 'application/json', body: JSON.stringify({ msg: 'Please try again' }),
  }) });
  await page.locator('#signupAcknowledgement').check();
  await page.locator('#syncSignUpButton').click();
  await page.waitForFunction(() => document.querySelector('#syncStatus').textContent === 'Please try again');
  assert.equal(await page.locator('#syncSignUpButton').isEnabled(), true);
  assert.equal(await page.locator('#signupAcknowledgement').isChecked(), true);
  await page.locator('#syncEmail').fill('another-test@example.com');
  assert.equal(await page.locator('#signupAcknowledgement').isChecked(), false);
  await page.locator('#syncSignUpButton').click();
  assert.equal(requests.length, 1);
});

test('pending signup prevents duplicate requests and identity changes', async (t) => {
  let finish;
  const pending = new Promise((resolve) => { finish = resolve; });
  const { page, requests } = await setup(t, { respond: async (route) => {
    await pending;
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"user":{"id":"synthetic-user"}}' });
  } });
  await page.locator('#signupAcknowledgement').check();
  await page.locator('#syncSignUpButton').click();
  try {
    await page.waitForFunction(() => document.querySelector('#syncSignUpButton').disabled);
    assert.equal(await page.locator('#syncEmail').isEnabled(), false);
    assert.equal(await page.locator('#signupAcknowledgement').isEnabled(), false);
    // Also cover direct handler calls that bypass the disabled button.
    await page.evaluate(() => signIn(true));
  } finally { finish(); }
  await page.waitForFunction(() => document.querySelector('#syncStatus').textContent.includes('Signup request received'));
  assert.equal(requests.length, 1);
});

test('immediate signup signs in and sign-out requires a fresh acknowledgement', async (t) => {
  const { page, requests } = await setup(t, { respond: (route, request) => {
    let body = [];
    if (new URL(request.url).pathname === '/auth/v1/signup') body = {
      access_token: 'synthetic-access', refresh_token: 'synthetic-refresh', expires_in: 3600,
      user: { id: 'synthetic-user', email: 'privacy-test@example.com', user_metadata: request.body.data },
    };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  } });
  await page.locator('#signupAcknowledgement').check();
  await page.locator('#syncSignUpButton').click();
  await page.waitForFunction(() => document.querySelector('#syncStatus').textContent.includes('Synced just now'));
  assert.equal(await page.locator('#signupAcknowledgementPanel').isVisible(), false);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('homeboard-sync-session-v1')));
  assert.equal(saved.user.user_metadata.homeboard_acknowledgement.terms_version, version);
  await page.locator('#syncSignOutButton').click();
  assert.equal(await page.locator('#signupAcknowledgement').isChecked(), false);
  assert.equal(await page.locator('#signupAcknowledgementPanel').isVisible(), true);
  const before = requests.length;
  await page.locator('#syncSignUpButton').click();
  assert.equal(requests.length, before);
});

test('document links preserve signup state, and privacy remains readable on narrow screens', async (t) => {
  const { page, context } = await setup(t, { viewport: { width: 375, height: 812 } });
  await page.locator('#signupAcknowledgement').check();
  const opened = context.waitForEvent('page');
  await page.locator('#signupAcknowledgementPanel a').first().click();
  const documentPage = await opened;
  await documentPage.waitForLoadState();
  assert.ok(documentPage.url().endsWith('/privacy.html#terms-of-use'));
  assert.equal(await documentPage.locator('#terms-of-use').isVisible(), true);
  assert.equal(await documentPage.evaluate(() => window.opener === null), true);
  assert.equal(await documentPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  if (process.env.HOMEBOARD_SCREENSHOT_DIR) {
    fs.mkdirSync(process.env.HOMEBOARD_SCREENSHOT_DIR, { recursive: true });
    await documentPage.screenshot({ path: path.join(process.env.HOMEBOARD_SCREENSHOT_DIR, 'privacy-phone.png'), fullPage: true });
    await page.locator('#signupAcknowledgementPanel').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(process.env.HOMEBOARD_SCREENSHOT_DIR, 'signup-phone.png') });
  }
  await documentPage.close();
  assert.equal(await page.locator('#signupAcknowledgement').isChecked(), true);
  assert.equal(await page.locator('#syncPassword').inputValue(), 'synthetic-password');
  assert.equal(await page.evaluate(() => document.querySelector('#settingsDialog').scrollWidth <= document.querySelector('#settingsDialog').clientWidth), true);
  await page.reload();
  await page.locator('#settingsButton').click();
  assert.equal(await page.locator('#signupAcknowledgement').isChecked(), false);
});

test('local planner editing remains available without an acknowledgement', async (t) => {
  const { page, requests } = await setup(t);
  await page.locator('#closeSettingsButton').click();
  await page.locator('#todoInput').fill('Synthetic local task');
  await page.locator('#todoForm button').click();
  assert.match(await page.locator('#todoList').innerText(), /Synthetic local task/);
  const editPrompt = page.waitForEvent('dialog').then(async (dialog) => {
    assert.match(dialog.message(), /Do not enter payment-card details, passwords/);
    await dialog.dismiss();
  });
  await page.locator('#todoList [data-list-action="edit"]').click();
  await editPrompt;
  assert.match(await page.locator('#todoList').innerText(), /Synthetic local task/);
  assert.equal(requests.length, 0);
});

test('entry warnings and save controls remain reachable on a short tablet screen', async (t) => {
  const { page } = await setup(t, { viewport: { width: 1024, height: 620 } });
  await page.locator('#closeSettingsButton').click();
  await page.locator('#addTaskButton').click();
  assert.equal(await page.locator('#taskPrivacyHint').isVisible(), true);
  assert.equal(await page.locator('#taskTitle').getAttribute('aria-describedby'), 'taskPrivacyHint');
  await page.locator('#taskTitle').fill('Synthetic event');
  await page.locator('#taskDate').fill('2026-10-09');
  await page.locator('#saveEventButton').click();
  assert.equal(await page.locator('#taskDialog').isVisible(), false);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('homeboard-household-planner-v1')));
  assert.ok(saved.tasks.some((task) => task.title === 'Synthetic event'));
  await page.locator('.day-header').first().click();
  assert.equal(await page.locator('#dayLabelPrivacyHint').isVisible(), true);
  await page.locator('#daySettingLabel').fill('Synthetic day');
  await page.locator('#daySettingsForm button[type="submit"]').click();
  assert.equal(await page.locator('#daySettingsDialog').isVisible(), false);
  if (process.env.HOMEBOARD_SCREENSHOT_DIR) {
    await page.screenshot({ path: path.join(process.env.HOMEBOARD_SCREENSHOT_DIR, 'entry-warnings-tablet.png') });
    await page.locator('#addTaskButton').click();
    await page.locator('#taskPrivacyHint').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(process.env.HOMEBOARD_SCREENSHOT_DIR, 'event-warning-tablet.png') });
  }
});

test('the installed service worker serves all privacy sections offline', async (t) => {
  const context = await browser.newContext();
  t.after(() => context.close());
  const page = await context.newPage();
  // Seed only synthetic data and no account so cloud services are never called.
  await page.addInitScript(() => {
    localStorage.setItem('homeboard-household-planner-v1', JSON.stringify({
      tasks: [], todos: [], groceries: [], meta: { demo: false, footballScheduleVersion: '20260922-v1' },
    }));
  });
  await page.goto(origin);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise((resolve) => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
  });
  await context.setOffline(true);
  await page.goto(`${origin}/privacy.html#privacy-notice`);
  for (const id of ['acceptable-use', 'terms-of-use', 'privacy-notice']) {
    assert.equal(await page.locator(`#${id}`).isVisible(), true);
  }
  assert.match(await page.title(), /Privacy & Terms/);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  assert.ok(await page.evaluate(() => window.scrollY > 0), 'Document scrolls in tablet landscape');
  assert.equal(await page.locator('main').evaluate((element) => getComputedStyle(element).backgroundColor), 'rgb(255, 255, 255)');
  if (process.env.HOMEBOARD_SCREENSHOT_DIR) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(process.env.HOMEBOARD_SCREENSHOT_DIR, 'privacy-tablet.png'), fullPage: true });
  }
});
