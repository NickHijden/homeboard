// Real browser with intercepted synthetic cloud responses; no emails or live users.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const origin = 'http://localhost:4173';
const project = 'https://invitations-test.supabase.co';
const user = { id: 'synthetic-owner', email: 'owner@example.invalid' };
const date = offset => new Date(Date.now() + offset * 86400000).toISOString();
const invite = (id, props = {}) => ({ invitation_id: id, invited_email: `${id}@example.invalid`, expires_at: date(7), created_at: date(-1), accepted_at: null, revoked_at: null, ...props });
let browser;
before(async () => { browser = await chromium.launch({ headless: true, channel: process.platform === 'win32' ? 'msedge' : undefined }); });
after(async () => browser?.close());

async function setup(t, options = {}) {
  const context = await browser.newContext({ serviceWorkers: 'block', viewport: options.viewport || { width: 1024, height: 768 } });
  t.after(() => context.close());
  const errors = []; context.on('page', p => p.on('pageerror', error => errors.push(error.message)));
  t.after(() => assert.deepEqual(errors, []));
  const cloud = { invitations: { one: [invite('pending'), invite('expired', { expires_at: date(-2) }), invite('accepted', { accepted_at: date(-3) }), invite('revoked', { revoked_at: date(-4) })], two: [] },
    requests: [], intercept: null };
  const reply = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  await context.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.origin === origin) {
      const file = url.pathname.slice(1) || 'index.html';
      if (!['index.html', 'app.js', 'recurrence.js', 'styles.css', 'manifest.webmanifest', 'assets/homeboard-banner.png'].includes(file)) return route.abort();
      return route.fulfill({ contentType: ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' })[path.extname(file)] || 'application/json', body: fs.readFileSync(path.join(root, file)) });
    }
    if (url.origin !== project) return route.abort();
    const r = { path: url.pathname, method: req.method(), body: req.postDataJSON() }; cloud.requests.push(r);
    if (cloud.intercept && await cloud.intercept(route, r)) return;
    if (r.path.endsWith('/list_my_households')) return reply(route, ['one', 'two'].map(id => ({ household_id: id, household_name: `Home ${id}`, role: options.role || 'owner' })));
    if (r.path.endsWith('/is_platform_admin')) return reply(route, false);
    if (r.path.endsWith('/list_household_invitations')) return reply(route, cloud.invitations[r.body.target_household_id]);
    if (r.path.endsWith('/create_household_invitation')) {
      const created = invite('created', { invited_email: r.body.target_email });
      cloud.invitations[r.body.target_household_id].push(created);
      return reply(route, [{ ...created, token: 'synthetic-created-token' }]);
    }
    if (r.path.endsWith('/renew_household_invitation')) {
      const row = Object.values(cloud.invitations).flat().find(i => i.invitation_id === r.body.target_invitation_id);
      row.expires_at = date(7); return reply(route, [{ ...row, token: `synthetic-renewed-${row.invitation_id}` }]);
    }
    if (r.path.endsWith('/revoke_household_invitation')) {
      Object.values(cloud.invitations).flat().find(i => i.invitation_id === r.body.target_invitation_id).revoked_at = date(0);
      return reply(route, true);
    }
    if (r.path === '/rest/v1/household_documents' || r.path === '/rest/v1/planner_documents') return reply(route, [{ data: { tasks: [], todos: [], groceries: [], meta: {} } }]);
    if (r.path === '/auth/v1/logout') return route.fulfill({ status: 204 });
    return reply(route, []);
  });
  await context.addInitScript(({ origin, project, user }) => {
    if (location.origin !== origin || localStorage.getItem('invites-initialized')) return;
    localStorage.setItem('invites-initialized', 'true');
    localStorage.setItem('homeboard-sync-config-v1', JSON.stringify({ url: project, key: 'synthetic-public-key' }));
    localStorage.setItem('homeboard-sync-session-v1', JSON.stringify({ user, access_token: 'synthetic-access', refresh_token: 'synthetic-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600 }));
    localStorage.setItem('homeboard-household-selection-v1', 'one');
  }, { origin, project, user });
  const page = await context.newPage(); page.setDefaultTimeout(10000);
  await page.goto(origin); await page.waitForFunction(() => householdState.loaded && !syncState.busy);
  await page.locator('#settingsButton').click(); await ready(page);
  return { page, context, cloud, reply };
}
const ready = page => page.waitForFunction(() => householdState.loaded && !householdState.loading && invitationState && !invitationState.loading && !invitationState.busy);
const row = (page, email) => page.locator('.invitation-row').filter({ hasText: `${email}@example.invalid` });
const mutations = cloud => cloud.requests.filter(r => /\/(renew|revoke|create)_household_invitation$/.test(r.path));
async function clickAction(page, id, action, confirm = true) {
  page.once('dialog', d => confirm ? d.accept() : d.dismiss());
  await row(page, id).locator(`[data-invitation-action="${action}"]`).click();
  await ready(page);
}

test('owner sees clear statuses with join/revocation dates and appropriate actions on a narrow screen', async t => {
  const { page } = await setup(t, { viewport: { width: 375, height: 812 } });
  assert.match(await row(page, 'pending').innerText(), /Pending · expires/);
  assert.match(await row(page, 'accepted').innerText(), /Accepted · joined/);
  assert.doesNotMatch(await row(page, 'accepted').innerText(), /expires/);
  assert.match(await row(page, 'revoked').innerText(), /Revoked/);
  assert.equal(await row(page, 'accepted').locator('button').count(), 0);
  assert.equal(await row(page, 'revoked').locator('button').count(), 0);
  assert.equal(await row(page, 'expired').locator('button').count(), 1);
  assert.equal(await row(page, 'pending').locator('button').count(), 2);
  const fits = await page.locator('#invitationList').evaluate(el => el.scrollWidth <= el.clientWidth);
  assert.equal(fits, true);
});

test('renewal can be cancelled, rotates the displayed link and supports manual copy on older browsers', async t => {
  const { page, cloud } = await setup(t);
  await clickAction(page, 'pending', 'renew', false); assert.equal(mutations(cloud).length, 0);
  await clickAction(page, 'pending', 'renew'); assert.equal(mutations(cloud).length, 1);
  assert.match(await page.locator('#householdStatus').innerText(), /old link no longer works/);
  assert.equal(await page.locator('#invitationLinkInput').inputValue(), `${origin}/?invite=synthetic-renewed-pending`);
  assert.match(await page.locator('#invitationLinkRecipient').innerText(), /pending@example.invalid.*No email has been sent/);
  await page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true }); document.execCommand = () => false; });
  await page.locator('#copyInvitationButton').click();
  assert.match(await page.locator('#householdStatus').innerText(), /copy it manually/);
  await page.evaluate(() => { document.execCommand = () => true; });
  await page.locator('#copyInvitationButton').click();
  assert.match(await page.locator('#householdStatus').innerText(), /link copied.*Send it/);
});

test('revocation can be cancelled, then removes a generated link and all actions for that invitation', async t => {
  const { page, cloud } = await setup(t);
  await clickAction(page, 'pending', 'renew');
  await clickAction(page, 'pending', 'revoke', false); assert.equal(mutations(cloud).length, 1);
  await clickAction(page, 'pending', 'revoke');
  assert.match(await row(page, 'pending').innerText(), /Revoked/);
  assert.equal(await row(page, 'pending').locator('button').count(), 0);
  assert.equal(await page.locator('#invitationLinkBox').isVisible(), false);
  assert.equal(await page.locator('#invitationLinkInput').inputValue(), '');
});

test('expired links can be renewed and ordinary invitation creation remains available', async t => {
  const { page } = await setup(t);
  await clickAction(page, 'expired', 'renew'); assert.match(await row(page, 'expired').innerText(), /Pending/);
  await page.locator('#inviteEmailInput').fill('newpartner@example.invalid');
  await page.locator('#createInvitationButton').click(); await ready(page);
  assert.match(await page.locator('#invitationLinkInput').inputValue(), /synthetic-created-token/);
  assert.match(await page.locator('#invitationLinkRecipient').innerText(), /newpartner@example.invalid/);
  await page.reload(); await page.waitForFunction(() => householdState.loaded && !syncState.busy);
  await page.locator('#settingsButton').click(); await ready(page);
  assert.equal(await page.locator('#invitationLinkInput').inputValue(), '', 'raw invitation link is never saved to device storage');
});

test('server rejection is shown honestly and a failed list request offers retry', async t => {
  const { page, cloud, reply } = await setup(t);
  cloud.intercept = async (route, r) => {
    if (r.path.endsWith('/renew_household_invitation')) { await reply(route, { message: 'Could not find the function public.renew_household_invitation in the schema cache' }, 404); return true; }
    return false;
  };
  await clickAction(page, 'pending', 'renew');
  assert.match(await page.locator('#householdStatus').innerText(), /not available yet/);
  assert.equal(await page.locator('#invitationLinkInput').inputValue(), '');
  cloud.intercept = async (route, r) => {
    if (r.path.endsWith('/list_household_invitations')) { await route.abort('internetdisconnected'); return true; }
    return false;
  };
  await page.evaluate(() => loadHouseholdInvitations());
  assert.match(await page.locator('#invitationList').innerText(), /could not be loaded/);
  assert.doesNotMatch(await page.locator('#invitationList').innerText(), /No invitations yet/);
  cloud.intercept = null;
  await page.locator('[data-invitation-action="refresh"]').click(); await ready(page);
  assert.equal(await page.locator('.invitation-row').count(), 4);
});

test('switching households clears links and rejects late invitation list responses', async t => {
  const { page, cloud, reply } = await setup(t);
  await clickAction(page, 'pending', 'renew');
  let release; const gate = new Promise(resolve => { release = resolve; });
  let started; const received = new Promise(resolve => { started = resolve; });
  cloud.intercept = async (route, r) => {
    if (r.path.endsWith('/list_household_invitations') && r.body.target_household_id === 'one') {
      started(); await gate; await reply(route, cloud.invitations.one); return true;
    }
    return false;
  };
  await page.evaluate(() => { window.delayedInviteLoad = loadHouseholdInvitations(); }); await received;
  await page.locator('#householdSelect').selectOption('two'); await ready(page);
  assert.equal(await page.locator('#invitationLinkInput').inputValue(), '');
  release(); await page.evaluate(() => window.delayedInviteLoad);
  assert.equal(await page.locator('.invitation-row').count(), 0);
  assert.match(await page.locator('#invitationList').innerText(), /No invitations yet/);
});

test('pending renewal prevents duplicates and late completion cannot restore a link after logout', async t => {
  const { page, cloud, reply } = await setup(t);
  let release; const gate = new Promise(resolve => { release = resolve; });
  let started; const received = new Promise(resolve => { started = resolve; });
  cloud.intercept = async (route, r) => {
    if (r.path.endsWith('/renew_household_invitation')) {
      started(); await gate; await reply(route, [{ ...cloud.invitations.one[0], token: 'late-private-token' }]); return true;
    }
    return false;
  };
  page.once('dialog', d => d.accept()); await row(page, 'pending').locator('[data-invitation-action="renew"]').click(); await received;
  assert.equal(await page.locator('#createInvitationButton').isDisabled(), true);
  assert.equal(await page.locator('#householdSelect').isDisabled(), true);
  await page.evaluate(() => { window.duplicateInviteAttempt = mutateInvitation('renew_household_invitation', { target_invitation_id: 'pending' }, 'duplicate'); });
  await page.evaluate(() => window.duplicateInviteAttempt); assert.equal(mutations(cloud).length, 1);
  await page.locator('#syncSignOutButton').click(); release();
  await page.waitForFunction(() => !syncState.session);
  await page.waitForTimeout(200);
  assert.equal(await page.locator('#invitationLinkInput').inputValue(), '');
  assert.equal(await page.locator('#householdWorkspace').isVisible(), false);
});

test('members cannot see owner invitations or invoke the renewal handler', async t => {
  const { page, cloud } = await setup(t, { role: 'member' });
  assert.equal(await page.locator('#householdInvitePanel').isVisible(), false);
  await page.evaluate(() => mutateInvitation('renew_household_invitation', { target_invitation_id: 'pending' }, 'unexpected'));
  assert.equal(mutations(cloud).length, 0);
});
