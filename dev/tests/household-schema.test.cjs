const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const sql = fs.readFileSync(path.join(root, 'supabase', 'households-setup.sql'), 'utf8');

test('Phase 3 schema is additive and preserves the old sync table', () => {
  assert.match(sql, /Safe additive migration/);
  assert.match(sql, /coexists with planner_documents/);
  assert.match(sql, /create table if not exists public\.households/);
  assert.match(sql, /create table if not exists public\.household_documents/);
});

test('household creation is atomic and membership cannot be granted by direct writes', () => {
  assert.match(sql, /create or replace function public\.create_household\(household_name text\)/);
  assert.match(sql, /security definer/);
  assert.match(sql, /insert into public\.household_members/);
  assert.match(sql, /insert into public\.household_documents/);
  assert.match(sql, /revoke all on table public\.household_members from anon, authenticated/);
  assert.match(sql, /revoke all on table public\.household_invitations from anon, authenticated/);
});

test('invitation storage supports expiry, single use, revocation, and hashed tokens', () => {
  assert.match(sql, /token_hash text not null unique/);
  assert.match(sql, /expires_at timestamptz not null/);
  assert.match(sql, /accepted_at timestamptz/);
  assert.match(sql, /revoked_at timestamptz/);
  assert.match(sql, /invited_email text not null/);
});

test('row-level security scopes household reads and document writes to members', () => {
  assert.match(sql, /alter table public\.households enable row level security/);
  assert.match(sql, /alter table public\.household_documents enable row level security/);
  assert.match(sql, /public\.is_household_member\(id\)/);
  assert.match(sql, /public\.is_household_member\(household_id\)/);
  assert.match(sql, /public\.is_household_owner\(id\)/);
});
