// Isolated PostgreSQL with synthetic Auth. Never connects to Supabase.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync, execFile } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const container = `homeboard-invite-management-${process.pid}-${Date.now()}`;
const args = ['exec', '-i', container, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-Atq'];
const sql = text => execFileSync('docker', args, { input: text, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
const sqlAsync = text => new Promise((resolve, reject) => {
  const child = execFile('docker', args, { encoding: 'utf8' }, (error, stdout, stderr) => error ? reject(new Error(stderr)) : resolve(stdout.trim()));
  child.stdin.end(text);
});
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const uid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const queryAs = (n, query, session = n + 100) => `begin; set local role authenticated;
  set local "request.jwt.claim.sub" = '${uid(n)}'; set local "request.jwt.claims" = '{"session_id":"${uid(session)}"}'; ${query}; commit;`;
const asUser = (n, query, session) => sql(queryAs(n, query, session));

test('invitation renewal, revocation and concurrent acceptance preserve authorization and planner data', { timeout: 120000 }, async t => {
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
  for (const file of ['supabase-setup.sql', 'supabase/households-setup.sql', 'supabase/household-invitations-setup.sql', 'supabase/account-data-setup.sql']) sql(read(file));
  sql(`insert into auth.users(id,email) values ('${uid(1)}','owner@example.invalid'),('${uid(2)}','member@example.invalid'),
    ('${uid(3)}','recipient@example.invalid'),('${uid(4)}','other@example.invalid'),('${uid(5)}','race@example.invalid');
    insert into auth.sessions select ('00000000-0000-4000-8000-'||lpad((n+100)::text,12,'0'))::uuid,
      ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid from generate_series(1,5) n;`);
  const household = asUser(1, "select public.create_household('Synthetic invitations')");
  const other = asUser(4, "select public.create_household('Other household')");
  sql(`insert into public.household_members(household_id,user_id) values ('${household}','${uid(2)}');
    update public.household_documents set data='{"synthetic":"preserve"}';`);
  const create = (email = 'recipient@example.invalid') => JSON.parse(asUser(1, `select row_to_json(i) from public.create_household_invitation('${household}','${email}') i`));
  const renew = (invitation, user = 1, session) => JSON.parse(asUser(user, `select row_to_json(i) from public.renew_household_invitation('${invitation.invitation_id}') i`, session));
  const revoke = (invitation, user = 1, session) => asUser(user, `select public.revoke_household_invitation('${invitation.invitation_id}')`, session);
  const accept = (invitation, user = 3) => asUser(user, `select * from public.accept_household_invitation('${invitation.token}')`);
  const row = invitation => sql(`select row_to_json(i) from public.household_invitations i where id='${invitation.invitation_id}'`);
  const initial = create();
  const before = row(initial);
  const migration = read('supabase/invitation-management-setup.sql');

  await t.test('repeatable installation preserves a previously issued invitation', () => {
    sql(migration); sql(migration); assert.equal(row(initial), before);
  });
  await t.test('members, another owner, anonymous and revoked sessions cannot renew or revoke', () => {
    for (const action of [renew, revoke]) {
      assert.throws(() => action(initial, 2), /Only the current household owner/);
      assert.throws(() => action(initial, 4), /Only the current household owner/);
      assert.throws(() => action(initial, 1, 999), /Sign in again/);
    }
    for (const name of ['renew_household_invitation','revoke_household_invitation']) {
      assert.throws(() => sql(`set role anon; select public.${name}('${initial.invitation_id}')`), /permission denied/);
      assert.throws(() => sql(`set role authenticated; select public.${name}('${initial.invitation_id}')`), /Sign in again/);
    }
    assert.throws(() => asUser(1, `select public.require_invitation_household_owner('${household}')`), /permission denied/);
    assert.throws(() => asUser(1, `update public.household_invitations set revoked_at=now()`), /permission denied/);
    assert.equal(row(initial), before);
  });
  await t.test('renewal rotates the token, extends expiry and accepts only the new token once', () => {
    const fresh = renew(initial);
    assert.equal(fresh.invitation_id, initial.invitation_id);
    assert.equal(fresh.invited_email, initial.invited_email);
    assert.notEqual(fresh.token, initial.token); assert.match(fresh.token, /^[a-f0-9]{64}$/);
    assert.ok(Math.abs(Date.parse(fresh.expires_at) - Date.now() - 7 * 86400000) < 10000);
    assert.equal(row(initial).includes(fresh.token), false, 'only the hash is stored');
    assert.throws(() => accept(initial), /expired, revoked, or already used/);
    assert.throws(() => accept(fresh, 4), /different email address/);
    assert.match(accept(fresh), /Synthetic invitations/);
    assert.throws(() => accept(fresh), /expired, revoked, or already used/);
    const accepted = row(initial);
    assert.throws(() => renew(initial), /already been accepted/);
    assert.throws(() => revoke(initial), /already been accepted/);
    assert.equal(row(initial), accepted);
    assert.equal(asUser(1, `select accepted_at is not null from public.list_household_invitations('${household}') where invitation_id='${initial.invitation_id}'`), 't');
  });
  await t.test('a failed update rolls back token rotation', () => {
    const invitation = create('rollback@example.invalid');
    const before = row(invitation);
    sql(`create function public.synthetic_invitation_failure() returns trigger language plpgsql as $$begin raise exception 'synthetic rollback'; end;$$;
      create trigger synthetic_invitation_failure after update on public.household_invitations for each row execute function public.synthetic_invitation_failure();`);
    try { assert.throws(() => renew(invitation), /synthetic rollback/); assert.equal(row(invitation), before); }
    finally { sql('drop trigger synthetic_invitation_failure on public.household_invitations'); }
  });
  await t.test('expired invitations can be renewed, revoked ones stay revoked, existing members cannot be reinvited by renewal', () => {
    const expired = create('other@example.invalid');
    sql(`update public.household_invitations set expires_at=now()-interval '1 day' where id='${expired.invitation_id}'`);
    const fresh = renew(expired);
    assert.throws(() => accept(expired, 4), /expired, revoked, or already used/);
    assert.equal(revoke(fresh), 't'); assert.equal(revoke(fresh), 't');
    assert.throws(() => accept(fresh, 4), /expired, revoked, or already used/);
    assert.throws(() => renew(fresh), /was revoked/);
    assert.throws(() => renew(create('member@example.invalid')), /already a household member/);
    assert.equal(sql(`select count(*) from public.household_members where household_id='${household}' and user_id='${uid(4)}'`), '0');
  });
  await t.test('acceptance that commits first cannot be overwritten by renewal or revocation', async () => {
    const invitation = create('race@example.invalid');
    const accepting = sqlAsync(queryAs(5, `set local application_name='invite-accept-test'; select * from public.accept_household_invitation('${invitation.token}'); select pg_sleep(1.5)`));
    for (let i = 0; ; i++) {
      if (sql("select count(*) from pg_stat_activity where application_name='invite-accept-test' and wait_event='PgSleep'") === '1') break;
      if (i > 40) throw new Error('Acceptance did not reach its checkpoint');
      await new Promise(r => setTimeout(r, 40));
    }
    const renewing = sqlAsync(queryAs(1, `select * from public.renew_household_invitation('${invitation.invitation_id}')`));
    const revoking = sqlAsync(queryAs(1, `select public.revoke_household_invitation('${invitation.invitation_id}')`));
    const results = await Promise.allSettled([accepting, renewing, revoking]);
    assert.equal(results[0].status, 'fulfilled');
    for (const result of results.slice(1)) { assert.equal(result.status, 'rejected'); assert.match(result.reason.message, /already been accepted/); }
    assert.equal(sql(`select count(*) from public.household_members where household_id='${household}' and user_id='${uid(5)}'`), '1');
  });
  await t.test('renewal that commits first rejects an old token waiting to be accepted', async () => {
    const invitation = create('other@example.invalid');
    const renewing = sqlAsync(queryAs(1, `set local application_name='invite-renew-test'; select row_to_json(i) from public.renew_household_invitation('${invitation.invitation_id}') i; select pg_sleep(1.5)`));
    for (let i = 0; ; i++) {
      if (sql("select count(*) from pg_stat_activity where application_name='invite-renew-test' and wait_event='PgSleep'") === '1') break;
      if (i > 40) throw new Error('Renewal did not reach its checkpoint');
      await new Promise(r => setTimeout(r, 40));
    }
    const accepting = sqlAsync(queryAs(4, `select * from public.accept_household_invitation('${invitation.token}')`));
    const results = await Promise.allSettled([renewing, accepting]);
    assert.equal(results[0].status, 'fulfilled'); assert.equal(results[1].status, 'rejected');
    assert.match(results[1].reason.message, /expired, revoked, or already used/);
    assert.match(accept(JSON.parse(results[0].value), 4), /Synthetic invitations/);
  });
  await t.test('a concurrent ownership transfer revokes the previous owner’s authority', async () => {
    const invitation = create('nobody@example.invalid');
    const transferring = sqlAsync(queryAs(1, `set local application_name='invite-transfer-test'; select public.transfer_household_ownership('${household}','${uid(2)}'); select pg_sleep(1.5)`));
    for (let i = 0; ; i++) {
      if (sql("select count(*) from pg_stat_activity where application_name='invite-transfer-test' and wait_event='PgSleep'") === '1') break;
      if (i > 40) throw new Error('Transfer did not reach its checkpoint');
      await new Promise(r => setTimeout(r, 40));
    }
    assert.throws(() => renew(invitation), /Only the current household owner/);
    await transferring;
    const fresh = renew(invitation, 2); assert.notEqual(fresh.token, invitation.token);
    assert.equal(revoke(fresh, 2), 't');
  });
  await t.test('other households, planners and account records are preserved', () => {
    assert.equal(sql('select count(*) from auth.users'), '5');
    assert.equal(sql('select count(*) from auth.sessions'), '5');
    assert.equal(sql("select count(*) from public.household_documents where data->>'synthetic'='preserve'"), '2');
    assert.equal(asUser(4, `select count(*) from public.list_household_invitations('${household}')`), '0');
    assert.equal(asUser(4, `select count(*) from public.list_household_invitations('${other}')`), '0');
  });
});
