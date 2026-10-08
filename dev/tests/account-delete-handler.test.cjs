const { test, before } = require('node:test');
const assert = require('node:assert/strict');
let createDeleteAccountHandler;
before(async () => { ({ createDeleteAccountHandler } = await import('../supabase/functions/delete-account/handler.mjs')); });
const user = { id: 'account-one', email: 'synthetic@example.com', email_confirmed_at: '2026-10-08' };
function setup(overrides = {}) {
  const calls = [];
  const handler = createDeleteAccountHandler({ url: 'https://synthetic.invalid', publicKey: 'public-test', serviceKey: 'server-only-test', origins: ['https://app.invalid'],
    fetchImpl: async (url, options) => {
      const path = url.replace('https://synthetic.invalid', '');
      calls.push({ path, ...options, body: options.body && JSON.parse(options.body) });
      if (overrides[path] instanceof Error) throw overrides[path];
      const response = overrides[path] || ({
        '/auth/v1/user': [200, user],
        '/auth/v1/token?grant_type=password': [200, { user, access_token: 'fresh-test-token' }],
        '/rest/v1/rpc/prepare_my_account_deletion': [200, true],
        '/auth/v1/admin/users/account-one': [200, user],
        '/auth/v1/logout?scope=local': [200, {}],
      })[path];
      assert.ok(response, `Unexpected call: ${path}`);
      return new Response(JSON.stringify(response[1]), { status: response[0] });
    } });
  const request = (body = {}, headers = {}) => new Request('https://function.invalid', { method: 'POST', headers: {
    origin: 'https://app.invalid', authorization: 'Bearer existing-test-token', 'content-type': 'application/json', ...headers,
  }, body: JSON.stringify({ password: 'test-password', confirmation: 'DELETE', preview: { account_id: user.id }, ...body }) });
  return { handler, request, calls };
}
test('deletion derives identity from Auth, reauthenticates and deletes with server-only credentials', async () => {
  const { handler, request, calls } = setup();
  const response = await handler(request());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { deleted: true, account_id: user.id });
  assert.deepEqual(calls.map(c => c.path), ['/auth/v1/user', '/auth/v1/token?grant_type=password', '/rest/v1/rpc/prepare_my_account_deletion', '/auth/v1/admin/users/account-one', '/auth/v1/logout?scope=local']);
  assert.deepEqual(calls[1].body, { email: user.email, password: 'test-password' });
  assert.equal(calls[2].headers.Authorization, 'Bearer fresh-test-token');
  assert.equal(calls[3].headers.Authorization, 'Bearer server-only-test');
  assert.equal(calls[3].body.should_soft_delete, false);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});
test('wrong passwords, invalid users, MFA and missing backend safeguards never reach deletion', async () => {
  for (const overrides of [
    { '/auth/v1/user': [401, {}] },
    { '/auth/v1/user': [200, { ...user, factors: [{ status: 'verified' }] }] },
    { '/auth/v1/token?grant_type=password': [400, {}] },
    { '/auth/v1/token?grant_type=password': [200, { user: { ...user, id: 'other-account' }, access_token: 'token' }] },
    { '/rest/v1/rpc/prepare_my_account_deletion': [409, { message: 'Changed ownership' }] },
    { '/rest/v1/rpc/prepare_my_account_deletion': [404, {}] },
    { '/rest/v1/rpc/prepare_my_account_deletion': [200, false] },
  ]) {
    const { handler, request, calls } = setup(overrides);
    assert.notEqual((await handler(request())).status, 200);
    assert.ok(!calls.some(c => c.path.includes('/admin/')));
    if (calls.some(c => c.path.includes('/rpc/'))) assert.ok(calls.some(c => c.path.includes('/logout')));
  }
});
test('caller cannot choose a target user or skip explicit confirmation', async () => {
  for (const body of [{ user_id: 'victim' }, { userId: 'victim' }, { confirmation: 'delete' }, { password: '' }, { preview: null }]) {
    const { handler, request, calls } = setup();
    assert.equal((await handler(request(body))).status, 400);
    assert.equal(calls.length, 0);
  }
});
test('CORS, bearer requirement, request size and HTTP method are enforced', async () => {
  const { handler, request, calls } = setup();
  assert.equal((await handler(request({}, { origin: 'https://untrusted.invalid' }))).status, 403);
  assert.equal((await handler(request({}, { authorization: '' }))).status, 401);
  assert.equal((await handler(request({ padding: 'x'.repeat(33000) }))).status, 413);
  assert.equal((await handler(new Request('https://function.invalid'))).status, 405);
  const preflight = await handler(new Request('https://function.invalid', { method: 'OPTIONS', headers: { origin: 'https://app.invalid' } }));
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://app.invalid');
  assert.equal(calls.length, 0);
});
test('failed or ambiguous server deletion never reports success or leaks server errors', async () => {
  for (const result of [[500, { message: 'server-only-test secret' }], new Error('server-only-test secret')]) {
    const { handler, request, calls } = setup({ '/auth/v1/admin/users/account-one': result });
    const response = await handler(request());
    assert.notEqual(response.status, 200);
    assert.doesNotMatch(await response.text(), /server-only-test/);
    assert.equal(calls.at(-1).path, '/auth/v1/logout?scope=local');
  }
});
