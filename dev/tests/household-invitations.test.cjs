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

test('invitation tokens use Supabase pgcrypto from the extensions schema', () => {
  assert.match(sql, /extensions\.gen_random_bytes\(32\)/);
  assert.match(sql, /extensions\.digest\(raw_token, 'sha256'\)/);
  assert.match(sql, /extensions\.digest\(btrim\(raw_token\), 'sha256'\)/);
});

test('invitation acceptance verifies the signed-in email and consumes the token once', () => {
  assert.match(sql, /email_confirmed_at is null/);
  assert.match(sql, /lower\(btrim\(invitation\.invited_email\)\) <> caller_email/);
  assert.match(sql, /accepted_at is null/);
  assert.match(sql, /revoked_at is null/);
  assert.match(sql, /expires_at > now\(\)/);
  assert.match(sql, /set accepted_at = now\(\), accepted_by = caller_id/);
});

test('member management is server-side and protects the owner', () => {
  assert.match(sql, /create or replace function public\.list_household_members\(target_household_id uuid\)/);
  assert.match(sql, /create or replace function public\.remove_household_member\(/);
  assert.match(sql, /create or replace function public\.leave_household\(target_household_id uuid\)/);
  assert.match(sql, /create or replace function public\.rename_household\(/);
  assert.match(sql, /create or replace function public\.transfer_household_ownership\(/);
  assert.match(sql, /Only the household owner can rename this household/);
  assert.match(sql, /Only the household owner can transfer ownership/);
  assert.match(sql, /Only a household owner can remove a member/);
  assert.match(sql, /The owner cannot remove themselves/);
  assert.match(sql, /The owner cannot leave the household/);
  assert.match(sql, /grant execute on function public\.list_household_members\(uuid\) to authenticated/);
  assert.doesNotMatch(sql, /grant execute on function public\.remove_household_member\(uuid, uuid\) to anon/);
});

test('platform administration is allowlisted, audited, and confirmation-gated', () => {
  assert.match(sql, /create table if not exists public\.platform_admins/);
  assert.match(sql, /create table if not exists public\.platform_admin_audit_log/);
  assert.match(sql, /create or replace function public\.is_platform_admin\(\)/);
  assert.match(sql, /create or replace function public\.list_platform_households\(\)/);
  assert.match(sql, /create or replace function public\.delete_household_for_admin\(target_household_id uuid\)/);
  assert.match(sql, /insert into public\.platform_admin_audit_log/);
  assert.match(sql, /grant execute on function public\.delete_household_for_admin\(uuid\) to authenticated/);
  assert.doesNotMatch(sql, /grant execute on function public\.delete_household_for_admin\(uuid\) to anon/);
  assert.match(app, /householdRpc\('is_platform_admin'/);
  assert.match(app, /householdRpc\('delete_household_for_admin'/);
  assert.match(app, /Type the household name exactly to confirm deletion/);
});

test('renaming a household refreshes the platform-admin list', () => {
  assert.match(app, /householdRpc\('rename_household'[\s\S]*?loadHouseholds\(true\);[\s\S]*?loadPlatformAdminUI\(true\);/);
});

test('development UI calls the invitation functions through authenticated RPC', () => {
  assert.match(app, /householdRpc\('list_my_households'/);
  assert.match(app, /mutateInvitation\('create_household_invitation'/);
  assert.match(app, /householdRpc\('accept_household_invitation'/);
  assert.match(app, /mutateInvitation\('revoke_household_invitation'/);
  assert.match(app, /householdRpc\('list_household_members'/);
  assert.match(app, /householdRpc\('remove_household_member'/);
  assert.match(app, /householdRpc\('leave_household'/);
  assert.match(app, /householdRpc\('rename_household'/);
  assert.match(app, /householdRpc\('transfer_household_ownership'/);
  assert.match(app, /function householdRpc\(functionName, body\)/);
  assert.match(app, /\/rest\/v1\/rpc\/\$\{functionName\}/);
});

test('household UI is enabled for the central production build and development hosts', () => {
  assert.match(app, /const HOUSEHOLD_UI_ENABLED = IS_DEVELOPMENT_HOST \|\| Boolean/);
  assert.match(app, /if \(!HOUSEHOLD_UI_ENABLED \|\| !els\.householdSection\) return;/);
  assert.match(app, /if \(els\.householdButton\) els\.householdButton\.hidden = !HOUSEHOLD_UI_ENABLED;/);
  assert.match(app, /if \(!HOUSEHOLD_UI_ENABLED \|\| !syncState\.session \|\| !syncState\.config\.url \|\| !syncState\.config\.key\)/);
  assert.match(app, /data-member-action="remove"/);
  assert.match(app, /data-member-action="leave"/);
  assert.match(app, /data-member-action="transfer"/);
});

test('household membership and invitation status refresh when the app becomes active', () => {
  assert.match(app, /if \(syncState\.session\) loadHouseholds\(true\);/);
  assert.match(app, /syncNow\(false\);\s*loadHouseholds\(true\);/);
});
