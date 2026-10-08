// Browser tests use the real public URLs with all requests intercepted locally.
// No real accounts are created and no confirmation emails are sent.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const stagingUrl = 'https://nickhijden.github.io/homeboard/dev/';
const productionUrl = 'https://nickhijden.github.io/homeboard/';
const developmentProject = 'https://axfxuqihsscjekicbgkk.supabase.co';
const productionProject = 'https://yflzmwriknvxhwhaetuk.supabase.co';
const developmentKey = 'sb_publishable_AJsvciGTAoJU62s-KPhUjQ_-sN4b7vB';
const allowed = new Set(['index.html', 'app.js', 'recurrence.js', 'styles.css', 'privacy.html', 'manifest.webmanifest', 'assets/homeboard-banner.png']);
let browser;
before(async () => { browser = await chromium.launch({ headless: true, channel: process.platform === 'win32' ? 'msedge' : undefined }); });
after(async () => { await browser?.close(); });

function savedSession(project) {
  return { access_token: `test.${Buffer.from(JSON.stringify({ iss: project + '/auth/v1' })).toString('base64url')}.test`,
    refresh_token: 'synthetic-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: 'synthetic-user', email: 'synthetic@example.com' } };
}

async function open(t, options = {}) {
  const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 } });
  t.after(() => context.close());
  const base = options.base || stagingUrl;
  const requests = [];
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.url().startsWith(base)) {
      const file = url.pathname.slice(new URL(base).pathname.length) || 'index.html';
      if (!allowed.has(file)) return route.abort();
      return route.fulfill({ status: 200, contentType: ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.png': 'image/png' })[path.extname(file)] || 'application/json', body: fs.readFileSync(path.join(root, file)) });
    }
    if (!url.hostname.endsWith('.supabase.co')) return route.abort();
    const record = { url: request.url(), key: request.headers().apikey, body: request.postDataJSON() };
    requests.push(record);
    let body = [];
    if (url.pathname === '/auth/v1/signup') body = { user: { id: 'synthetic-new-account' } };
    if (url.pathname.endsWith('/is_platform_admin')) body = false;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  if (options.storage) await context.addInitScript(({ storage, origin }) => {
    if (location.origin !== origin) return;
    Object.entries(storage).forEach(([key, value]) => localStorage.setItem(key, value));
  }, { storage: options.storage, origin: new URL(base).origin });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.stack || error.message));
  t.after(() => assert.deepEqual(errors, [], 'No browser runtime errors'));
  await page.goto(base);
  await page.locator('#settingsButton').click();
  return { page, requests };
}

test('a fresh staging customer signs up with only email, password and acknowledgement', async t => {
  const { page, requests } = await open(t);
  assert.equal(await page.locator('#syncConfigFields').isVisible(), false);
  assert.equal(await page.locator('#saveSyncConfigButton').isVisible(), false);
  assert.doesNotMatch(await page.locator('#settingsDialog').innerText(), /Supabase|publishable key|project URL|Save connection/);
  assert.equal(await page.locator('#syncStatus').textContent(), 'Sign in to your Homeboard account.');
  assert.equal(await page.evaluate(() => localStorage.getItem(SYNC_CONFIG_KEY)), null, 'No prior setup needed');
  await page.locator('#syncEmail').fill('synthetic-customer@example.com');
  await page.locator('#syncPassword').fill('synthetic-password');
  await page.locator('#signupAcknowledgement').check();
  await page.locator('#syncSignUpButton').click();
  await page.waitForFunction(() => document.querySelector('#syncStatus').textContent.includes('Signup request received'));
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, developmentProject + '/auth/v1/signup');
  assert.equal(requests[0].key, developmentKey);
  assert.equal(requests[0].body.email, 'synthetic-customer@example.com');
  assert.ok(requests[0].body.data.homeboard_acknowledgement.terms_version);
  // Fresh starter data must remain renderable after IndexedDB recovery/reload.
  await page.reload();
  await page.locator('#nextWeekButton').click();
});

test('staging ignores a saved production connection and refuses its saved session', async t => {
  const productionSession = JSON.stringify(savedSession(productionProject));
  const { page, requests } = await open(t, { storage: {
    'homeboard-sync-config-v1-staging': JSON.stringify({ url: productionProject, key: 'wrong-project-key' }),
    'homeboard-sync-session-v1-staging': productionSession,
    'homeboard-sync-session-v1': productionSession,
    'homeboard-household-planner-v1': 'production-planner-sentinel',
  } });
  assert.deepEqual(await page.evaluate(() => syncState.config), { url: developmentProject, key: developmentKey });
  assert.equal(await page.evaluate(() => syncState.session), null);
  assert.equal(requests.length, 0, 'A foreign session must cause no automatic cloud requests');
  await page.evaluate(() => {
    document.querySelector('#syncProjectUrl').value = 'https://yflzmwriknvxhwhaetuk.supabase.co';
    document.querySelector('#syncPublishableKey').value = 'wrong-project-key';
    saveSyncConfig();
  });
  assert.equal(await page.evaluate(() => syncState.config.url), developmentProject);
  assert.equal(await page.evaluate(() => localStorage.getItem('homeboard-sync-session-v1')), productionSession);
  assert.equal(await page.evaluate(() => localStorage.getItem('homeboard-household-planner-v1')), 'production-planner-sentinel');
});

test('existing Development customers stay signed in after automatic configuration', async t => {
  const { page, requests } = await open(t, { storage: {
    'homeboard-sync-session-v1-staging': JSON.stringify(savedSession(developmentProject)),
    'homeboard-sync-config-v1-staging': JSON.stringify({ url: developmentProject, key: developmentKey }),
  } });
  await page.waitForFunction(() => document.querySelector('#syncStatus').textContent.includes('Synced just now'));
  assert.equal(await page.evaluate(() => syncState.session.user.id), 'synthetic-user');
  assert.equal(await page.locator('#syncConfigFields').isVisible(), false);
  assert.ok(requests.length > 0);
  assert.ok(requests.every(request => request.url.startsWith(developmentProject + '/')));
});

test('the production customer flow still uses its own fixed connection', async t => {
  const { page } = await open(t, { base: productionUrl });
  assert.equal(await page.evaluate(() => syncState.config.url), productionProject);
  assert.equal(await page.locator('#syncConfigFields').isVisible(), false);
  assert.equal(await page.locator('#syncStatus').textContent(), 'Sign in to your Homeboard account.');
});
