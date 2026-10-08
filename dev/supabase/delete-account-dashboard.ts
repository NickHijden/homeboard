// Generated dashboard bundle. Development project axfxuqihsscjekicbgkk only.
// Pure request handler, shared by Deno deployment and Node security tests.
// Never log requests, passwords, access tokens or service-role credentials.
export function createDeleteAccountHandler({ url, publicKey, serviceKey, origins, fetchImpl = fetch }) {
  return async function handle(request) {
    const origin = request.headers.get('origin');
    const allowed = origin && origins.includes(origin);
    const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin' };
    if (allowed) Object.assign(headers, {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    });
    const reply = (status, body) => new Response(JSON.stringify(body), { status, headers });
    if (origin && !allowed) return reply(403, { message: 'This site is not allowed to delete accounts.' });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return reply(405, { message: 'Use POST.' });
    if (!url || !publicKey || !serviceKey) return reply(503, { message: 'Account deletion is not configured yet.' });
    const bearer = request.headers.get('authorization');
    if (!bearer || !/^Bearer \S+$/i.test(bearer)) return reply(401, { message: 'Sign in again before deleting your account.' });
    let freshToken;
    let deleteStarted = false;
    const call = async (path, method, token, body, key = publicKey) => {
      const response = await fetchImpl(url + path, {
        method, headers: { apikey: key, Authorization: token, 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const data = await response.json().catch(() => null);
      return { ok: response.ok, data };
    };
    try {
      // Bound the stream as well as Content-Length, which a caller can omit.
      const reader = request.body?.getReader();
      if (!reader) return reply(400, { message: 'Confirmation is required.' });
      const chunks = []; let length = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > 32768) { await reader.cancel(); return reply(413, { message: 'Request is too large.' }); }
        chunks.push(value);
      }
      const bytes = new Uint8Array(length); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      let body;
      try { body = JSON.parse(new TextDecoder().decode(bytes)); } catch { return reply(400, { message: 'Invalid confirmation.' }); }
      if (!body || body.confirmation !== 'DELETE' || typeof body.password !== 'string' || !body.password
        || body.password.length > 1024 || !body.preview || body.user_id || body.userId) {
        return reply(400, { message: 'Enter your current password and type DELETE.' });
      }
      const identity = await call('/auth/v1/user', 'GET', bearer);
      const user = identity.data;
      if (!identity.ok || !user?.id || !user.email || !user.email_confirmed_at) {
        return reply(401, { message: 'Sign in with a confirmed email before deleting your account.' });
      }
      // Password-only deletion must not bypass an enrolled second factor.
      if ((user.factors || []).some(factor => factor.status === 'verified')) {
        return reply(409, { message: 'This account uses multi-factor authentication. Contact the Homeboard operator for assisted deletion.' });
      }
      const fresh = await call('/auth/v1/token?grant_type=password', 'POST', `Bearer ${publicKey}`,
        { email: user.email, password: body.password });
      body.password = '';
      if (!fresh.ok || fresh.data?.user?.id !== user.id || !fresh.data?.access_token) {
        return reply(403, { message: 'Password confirmation failed. Your account has not been deleted.' });
      }
      freshToken = `Bearer ${fresh.data.access_token}`;
      if ((fresh.data.user.factors || []).some(factor => factor.status === 'verified')) {
        return reply(409, { message: 'Multi-factor authentication requires assisted deletion.' });
      }
      // The RPC validates identity, a live session, blockers and exact preview.
      const prepare = await call('/rest/v1/rpc/prepare_my_account_deletion', 'POST', freshToken,
        { expected_preview: body.preview });
      if (!prepare.ok || prepare.data !== true) {
        return reply(409, { message: 'Deletion is unavailable or household details changed. Close this dialog and review deletion again. Transfer shared household ownership and remove platform administrator access first if applicable.' });
      }
      deleteStarted = true;
      const deleted = await call(`/auth/v1/admin/users/${encodeURIComponent(user.id)}`, 'DELETE', `Bearer ${serviceKey}`,
        { should_soft_delete: false }, serviceKey);
      if (!deleted.ok) return reply(409, { message: 'The server could not delete your account. Review household ownership or contact the Homeboard operator. Your local data has been kept.' });
      return reply(200, { deleted: true, account_id: user.id });
    } catch {
      return reply(503, { message: deleteStarted
        ? 'The deletion result could not be confirmed. Your local data has been kept. Contact the Homeboard operator to check the account before retrying.'
        : 'Account deletion could not connect to the server. Please try again.' });
    } finally {
      // Reauthentication creates a temporary session; never leave it behind.
      if (freshToken) await call('/auth/v1/logout?scope=local', 'POST', freshToken).catch(() => {});
    }
  };
}


Deno.serve(createDeleteAccountHandler({
  url: Deno.env.get('SUPABASE_URL'),
  publicKey: Deno.env.get('SUPABASE_ANON_KEY'),
  serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
  origins: (Deno.env.get('HOMEBOARD_ALLOWED_ORIGINS') || 'https://nickhijden.github.io')
    .split(',').map(value => value.trim()).filter(Boolean),
}));
