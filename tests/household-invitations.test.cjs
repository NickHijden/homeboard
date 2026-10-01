const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const sql = fs.readFileSync(path.join(root, 'supabase', 'household-invitations-setup.sql'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

test('invitation functions are server-side and callable only by authenticated users', () => {
  assert.match(sql, /create or replace function public\.create_household_invitation/);
  assert.match(sql, /create or replace function public\.accept_household_invitation/);
  assert.match(sql, /security definer/);
  assert.match(sql, /grant execute on function public\.accept_household_invitation\(text\) to authenticated/);
  assert.doesNotMatch(sql, /grant execute on function public\.accept_household_invitation\(text\) to anon/);
});

test('invitation acceptance verifies the signed-in email and consumes the token once', () => {
  assert.match(sql, /email_confirmed_at is null/);
  assert.match(sql, /lower\(btrim\(invitation\.invited_email\)\) <> caller_email/);
  assert.match(sql, /accepted_at is null/);
  assert.match(sql, /revoked_at is null/);
  assert.match(sql, /expires_at > now\(\)/);
  assert.match(sql, /set accepted_at = now\(\), accepted_by = caller_id/);
});

test('development UI calls the invitation functions through authenticated RPC', () => {
  assert.match(app, /householdRpc\('list_my_households'/);
  assert.match(app, /householdRpc\('create_household_invitation'/);
  assert.match(app, /householdRpc\('accept_household_invitation'/);
  assert.match(app, /householdRpc\('revoke_household_invitation'/);
  assert.match(app, /function householdRpc\(functionName, body\)/);
  assert.match(app, /\/rest\/v1\/rpc\/\$\{functionName\}/);
});

test('household UI is gated to development hosts', () => {
  assert.match(app, /if \(!IS_DEVELOPMENT_HOST \|\| !els\.householdSection\) return;/);
  assert.match(app, /if \(els\.householdButton\) els\.householdButton\.hidden = false;/);
});
