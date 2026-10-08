// Integration test against an isolated PostgreSQL container. Never uses a
// Supabase project. Run: node --test tests/account-data.database.cjs
const { test } = require('node:test');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const container = `homeboard-account-tests-${process.pid}-${Date.now()}`;
const sql = (text) => execFileSync('docker', ['exec', '-i', container, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At'], { input: text, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
test('account export isolation and transactional deletion in real PostgreSQL', { timeout: 60000 }, async (t) => {
  execFileSync('docker', ['run', '--detach', '--rm', '--pull=never', '--name', container, '--network', 'none', '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', 'postgres:16-alpine'], { stdio: 'pipe' });
  t.after(() => execFileSync('docker', ['rm', '-f', container], { stdio: 'pipe' }));
  for (let attempt = 0; ; attempt += 1) {
    try { sql('select 1'); break; } catch (error) { if (attempt >= 40) throw error; await new Promise(resolve => setTimeout(resolve, 200)); }
  }
  // Test database must be empty. Destructive setup is limited to this explicitly
  // named temporary container, which has no network or persistent volumes.
  sql(`create role anon; create role authenticated; create role service_role;
    create schema auth; create schema extensions; create extension pgcrypto with schema extensions;
    create table auth.users(id uuid primary key, email text, phone text, created_at timestamptz default now(), updated_at timestamptz default now(),
      email_confirmed_at timestamptz default now(), last_sign_in_at timestamptz, raw_user_meta_data jsonb default '{}', encrypted_password text default 'never-export-this');
    create table auth.sessions(id uuid primary key, user_id uuid references auth.users on delete cascade);
    create table auth.identities(user_id uuid references auth.users on delete cascade, provider text, created_at timestamptz, last_sign_in_at timestamptz);
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
    create function auth.jwt() returns jsonb language sql as $$select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb$$;
    grant usage on schema auth to authenticated, anon;
    grant execute on function auth.uid(), auth.jwt() to authenticated, anon;`);
  for (const p of ['supabase-setup.sql', 'supabase/households-setup.sql', 'supabase/household-invitations-setup.sql', 'supabase/account-data-setup.sql']) sql(read(p));
  sql(read('supabase/account-data-setup.sql')); // Rerunnable without losing data.
  const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const asUser = (n, query, session = n + 100) => `begin; set local role authenticated;
    set local "request.jwt.claim.sub" = '${uid(n)}';
    set local "request.jwt.claims" = '{"session_id":"${uid(session)}"}'; ${query}; commit;`;
  sql(`insert into auth.users(id,email,raw_user_meta_data) values
    ('${uid(1)}','owner@example.com','{"homeboard_acknowledgement":{"terms_version":"test"}}'),
    ('${uid(2)}','partner@example.com','{}'), ('${uid(3)}','outsider@example.com','{}'), ('${uid(4)}','admin@example.com','{}');
    insert into auth.sessions values ('${uid(101)}','${uid(1)}'), ('${uid(102)}','${uid(2)}'), ('${uid(103)}','${uid(3)}'), ('${uid(104)}','${uid(4)}');
    insert into auth.identities values ('${uid(1)}','email',now(),now());
    insert into public.planner_documents values ('${uid(1)}','{"private":"owner"}',now()), ('${uid(3)}','{"secret":"outsider"}',now());
    insert into public.households(id,name,created_by) values ('${uid(11)}','Shared','${uid(1)}'), ('${uid(12)}','Solo','${uid(1)}'), ('${uid(13)}','Unrelated','${uid(3)}');
    insert into public.household_members(household_id,user_id,role) values ('${uid(11)}','${uid(1)}','owner'), ('${uid(11)}','${uid(2)}','member'), ('${uid(12)}','${uid(1)}','owner'), ('${uid(13)}','${uid(3)}','owner');
    insert into public.household_documents(household_id,data) values ('${uid(11)}','{"shared":"retained"}'), ('${uid(12)}','{"solo":"removed"}'), ('${uid(13)}','{"secret":"unrelated"}');
    insert into public.household_invitations(household_id,invited_email,invited_by,token_hash,expires_at) values
      ('${uid(11)}','invitee@example.com','${uid(1)}','never-export-token',now()+interval '1 day'),
      ('${uid(13)}','OWNER@example.com','${uid(3)}','incoming-token',now()+interval '1 day'),
      ('${uid(13)}','unrelated@example.com','${uid(3)}','unrelated-token',now()+interval '1 day');
    insert into public.platform_admins(user_id) values ('${uid(4)}');
    insert into public.platform_admin_audit_log(admin_user_id,action,household_id,household_name) values ('${uid(4)}','delete_household','${uid(99)}','Earlier deleted household');`);
  const exported = JSON.parse(sql(asUser(1, 'select public.export_my_account_data()')).split('\n').find(l => l.startsWith('{')));
  assert.equal(exported.account.id, uid(1));
  assert.equal(exported.account.profile_and_policy_acknowledgement.homeboard_acknowledgement.terms_version, 'test');
  assert.equal(exported.households.length, 2);
  assert.equal(exported.invitations.length, 2);
  assert.doesNotMatch(JSON.stringify(exported), /never-export|outsider|unrelated/);
  assert.throws(() => sql('set role anon; select public.export_my_account_data();'), /permission denied/);
  assert.throws(() => sql(asUser(1, 'select public.export_my_account_data()', 999)), /Sign in again/);
  // Optional reminder tables must also be included and cascade on deletion.
  sql(`create table public.homeboard_reminder_log(planner_id uuid references public.planner_documents(id) on delete cascade, task_id text, occurrence_date date, sent_at timestamptz default now());
    insert into public.homeboard_reminder_log(planner_id,task_id,occurrence_date) values ('${uid(1)}','reminder-test',current_date), ('${uid(3)}','outsider-reminder',current_date);`);
  const withReminders = JSON.parse(sql(asUser(1, 'select public.export_my_account_data()')).split('\n').find(l => l.startsWith('{')));
  assert.equal(withReminders.reminder_history.length, 1);
  assert.equal(withReminders.reminder_history[0].task_id, 'reminder-test');
  assert.throws(() => sql(asUser(1, "select public.prepare_my_account_deletion('{}')")), /details changed/);
  assert.throws(() => sql(asUser(1, 'select public.prepare_my_account_deletion(public.preview_my_account_deletion())')), /Transfer ownership/);
  assert.throws(() => sql(`delete from auth.users where id='${uid(1)}'`), /Transfer ownership/);
  assert.equal(sql('select count(*) from public.planner_documents').trim(), '2', 'blocked deletion removes nothing');
  assert.throws(() => sql(`delete from auth.users where id='${uid(4)}'`), /administrator/);
  sql(asUser(1, `select public.transfer_household_ownership('${uid(11)}','${uid(2)}')`));
  sql(asUser(1, 'select public.prepare_my_account_deletion(public.preview_my_account_deletion())'));
  sql(`update public.households set name='Changed solo' where id='${uid(12)}'`);
  assert.throws(() => sql(`delete from auth.users where id='${uid(1)}'`), /preview expired or changed/);
  assert.equal(sql('select count(*) from public.households').trim(), '3');
  sql(asUser(1, 'select public.prepare_my_account_deletion(public.preview_my_account_deletion())'));
  // Prove cleanup rolls back if ANY later auth-deletion step fails.
  sql(`create function auth.synthetic_failure() returns trigger language plpgsql as $$begin raise exception 'synthetic downstream failure'; end;$$;
    create trigger z_test_failure after delete on auth.users for each row execute function auth.synthetic_failure();`);
  assert.throws(() => sql(`delete from auth.users where id='${uid(1)}'`), /synthetic downstream failure/);
  assert.equal(sql('select count(*) from public.household_invitations').trim(), '3');
  assert.equal(sql('select count(*) from public.households').trim(), '3');
  sql('drop trigger z_test_failure on auth.users;');
  sql(`delete from auth.users where id='${uid(1)}'`);
  assert.equal(sql(`select count(*) from public.planner_documents where id='${uid(1)}'`).trim(), '0');
  assert.equal(sql(`select count(*) from auth.sessions where user_id='${uid(1)}'`).trim(), '0');
  assert.equal(sql(`select count(*) from public.homeboard_reminder_log where planner_id='${uid(1)}'`).trim(), '0');
  assert.equal(sql(`select count(*) from public.households where id='${uid(12)}'`).trim(), '0');
  assert.equal(sql(`select created_by is null from public.households where id='${uid(11)}'`).trim(), 't');
  assert.match(sql(`select data from public.household_documents where household_id='${uid(11)}'`), /retained/);
  assert.equal(sql('select count(*) from public.household_invitations').trim(), '1');
  assert.throws(() => sql(asUser(1, 'select public.export_my_account_data()')), /Sign in again/);
  sql(`delete from public.platform_admins where user_id='${uid(4)}'; delete from auth.users where id='${uid(4)}';`);
  assert.equal(sql('select admin_user_id is null from public.platform_admin_audit_log').trim(), 't');
  // The remaining member/owner cannot erase an unrelated household.
  assert.equal(sql(`select count(*) from public.households where id='${uid(13)}'`).trim(), '1');
});
