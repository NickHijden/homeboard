// Isolated PostgreSQL only: synthetic users/sessions, no live Supabase access.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync, execFile } = require('node:child_process');
const { promisify } = require('node:util');
const fs = require('node:fs');
const path = require('node:path');
const container = `homeboard-household-delete-${process.pid}-${Date.now()}`;
const args = ['exec', '-i', container, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-Atq'];
const sql = text => execFileSync('docker', args, { input: text, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
const uid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const asUser = (n, query, session = n + 100) => `begin; set local role authenticated;
  set local "request.jwt.claim.sub" = '${uid(n)}';
  set local "request.jwt.claims" = '{"session_id":"${uid(session)}"}'; ${query}; commit;`;
const remove = (n, household = 11, name = 'Shared') => sql(asUser(n, `select public.delete_my_household('${uid(household)}','${name}')`));

test('owner household deletion permissions, atomic cleanup and concurrent ownership transfer', { timeout: 90000 }, async t => {
  execFileSync('docker', ['run', '--detach', '--rm', '--pull=never', '--name', container, '--network', 'none', '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', 'postgres:16-alpine'], { stdio: 'pipe' });
  t.after(() => execFileSync('docker', ['rm', '-f', container], { stdio: 'pipe' }));
  for (let i = 0; ; i++) {
    try { sql('select 1'); break; } catch (error) { if (i > 40) throw error; await new Promise(r => setTimeout(r, 200)); }
  }
  sql(`create role anon; create role authenticated; create role service_role;
    create schema auth; create schema extensions; create extension pgcrypto with schema extensions;
    create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz default now());
    create table auth.sessions(id uuid primary key, user_id uuid references auth.users on delete cascade);
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.jwt() returns jsonb language sql as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
    grant usage on schema auth to authenticated, anon;
    grant execute on function auth.uid(),auth.jwt() to authenticated,anon;`);
  const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  for (const file of ['supabase-setup.sql', 'supabase/households-setup.sql', 'supabase/household-invitations-setup.sql', 'supabase/account-data-setup.sql', 'supabase/household-deletion-setup.sql']) sql(read(file));
  sql(`insert into auth.users(id,email) values ('${uid(1)}','owner@example.invalid'),('${uid(2)}','member@example.invalid'),('${uid(3)}','outsider@example.invalid');
    insert into auth.sessions values ('${uid(101)}','${uid(1)}'),('${uid(102)}','${uid(2)}'),('${uid(103)}','${uid(3)}');
    insert into public.planner_documents(id,data) values ('${uid(1)}','{"private":"keep"}');
    insert into public.households(id,name,created_by) values ('${uid(11)}','Shared','${uid(1)}'),('${uid(12)}','Other','${uid(1)}'),('${uid(13)}','Transfer','${uid(1)}');
    insert into public.household_members(household_id,user_id,role) values
      ('${uid(11)}','${uid(1)}','owner'),('${uid(11)}','${uid(2)}','member'),('${uid(12)}','${uid(1)}','owner'),
      ('${uid(13)}','${uid(1)}','owner'),('${uid(13)}','${uid(2)}','member');
    insert into public.household_documents(household_id,data) values ('${uid(11)}','{"shared":"delete"}'),('${uid(12)}','{"other":"keep"}'),('${uid(13)}','{}');
    insert into public.household_invitations(household_id,invited_email,invited_by,token_hash,expires_at) values
      ('${uid(11)}','invite@example.invalid','${uid(1)}','synthetic-hash',now()+interval '1 day'),
      ('${uid(12)}','other@example.invalid','${uid(1)}','synthetic-other',now()+interval '1 day');`);
  const snapshot = () => sql(`select jsonb_build_object('homes',(select jsonb_agg(h) from public.households h),
    'members',(select jsonb_agg(m) from public.household_members m),'docs',(select jsonb_agg(d) from public.household_documents d),
    'invites',(select jsonb_agg(i) from public.household_invitations i))`);
  await t.test('install is repeatable and deletes no existing data', () => {
    const before = snapshot(); sql(read('supabase/household-deletion-setup.sql')); assert.equal(snapshot(), before);
  });
  await t.test('member, outsider, anonymous, missing or revoked session cannot delete; direct table deletion stays forbidden', () => {
    const before = snapshot();
    assert.throws(() => remove(2), /Only the current household owner/);
    assert.throws(() => remove(3), /Only the current household owner/);
    assert.throws(() => remove(1, 999), /Only the current household owner/);
    assert.throws(() => sql(`set role anon; select public.delete_my_household('${uid(11)}','Shared')`), /permission denied/);
    assert.throws(() => sql(`set role authenticated; select public.delete_my_household('${uid(11)}','Shared')`), /Sign in again/);
    assert.throws(() => sql(asUser(1, `select public.delete_my_household('${uid(11)}','Shared')`, 999)), /Sign in again/);
    assert.throws(() => sql(asUser(1, `delete from public.households where id='${uid(11)}'`)), /permission denied/);
    assert.equal(snapshot(), before);
  });
  await t.test('exact current name is required, including after a rename', () => {
    assert.throws(() => remove(1, 11, 'shared'), /name does not match/);
    assert.throws(() => sql(asUser(1, `select public.delete_my_household('${uid(11)}',null)`)), /name does not match/);
    sql(`update public.households set name='Renamed' where id='${uid(11)}'`);
    assert.throws(() => remove(1), /name does not match/);
    sql(`update public.households set name='Shared' where id='${uid(11)}'`);
  });
  await t.test('a downstream failure rolls back the entire deletion', () => {
    sql(`create function public.synthetic_delete_failure() returns trigger language plpgsql as $$begin raise exception 'synthetic failure'; end;$$;
      create trigger synthetic_failure after delete on public.households for each row execute function public.synthetic_delete_failure();`);
    const before = snapshot();
    assert.throws(() => remove(1), /synthetic failure/); assert.equal(snapshot(), before);
    sql('drop trigger synthetic_failure on public.households');
  });
  await t.test('concurrent transfer completes before deletion checks the old owner membership', async () => {
    const statement = asUser(1, `set local application_name='homeboard-transfer-test'; select public.transfer_household_ownership('${uid(13)}','${uid(2)}'); select pg_sleep(1.5)`);
    const transfer = promisify(execFile)('docker', [...args, '-c', statement]);
    for (let i = 0; ; i++) {
      if (sql("select count(*) from pg_stat_activity where application_name='homeboard-transfer-test' and wait_event='PgSleep'") === '1') break;
      if (i > 30) throw new Error('Transfer did not reach its lock checkpoint');
      await new Promise(r => setTimeout(r, 50));
    }
    assert.throws(() => remove(1, 13, 'Transfer'), /Only the current household owner/);
    await transfer;
    assert.equal(remove(2, 13, 'Transfer'), 't');
  });
  await t.test('owner deletion removes only the chosen shared household and keeps every account', () => {
    assert.equal(remove(1), 't');
    for (const table of ['households', 'household_members', 'household_documents', 'household_invitations']) {
      const column = table === 'households' ? 'id' : 'household_id';
      assert.equal(sql(`select count(*) from public.${table} where ${column}='${uid(11)}'`), '0');
      assert.equal(sql(`select count(*) from public.${table} where ${column}='${uid(12)}'`), '1');
    }
    assert.equal(sql('select count(*) from auth.users'), '3');
    assert.equal(sql('select count(*) from auth.sessions'), '3');
    assert.match(sql('select data from public.planner_documents'), /keep/);
    assert.match(sql(`select data from public.household_documents where household_id='${uid(12)}'`), /keep/);
    assert.throws(() => remove(1), /Only the current household owner/);
    assert.equal(remove(1, 12, 'Other'), 't', 'sole-member household can also be deleted');
    assert.equal(sql('select count(*) from auth.users'), '3');
  });
});
