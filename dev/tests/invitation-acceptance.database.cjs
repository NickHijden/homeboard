// Real PostgreSQL tests. No Supabase project, user token or email is used.
// Requires Docker and an existing postgres:16-alpine image.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFile, execFileSync } = require('node:child_process');
const container = `homeboard-invitation-tests-${process.pid}-${Date.now()}`;
const args = ['exec', '-i', container, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-Atq'];
const sql = text => execFileSync('docker', args, { input: text, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
const sqlAsync = text => new Promise((resolve, reject) => {
  const child = execFile('docker', args, { encoding: 'utf8' }, (error, stdout, stderr) => {
    if (error) reject(new Error(stderr)); else resolve(stdout.trim());
  });
  child.stdin.end(text);
});
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const uid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const queryAs = (user, statement) => `begin; set local role authenticated;
  set local "request.jwt.claim.sub" = '${uid(user)}'; ${statement}; commit;`;
const asUser = (user, statement) => sql(queryAs(user, statement));

test('invitation acceptance works in PostgreSQL and preserves its security checks', { timeout: 90000 }, async t => {
  execFileSync('docker', ['run', '--detach', '--rm', '--pull=never', '--name', container, '--network', 'none',
    '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', 'postgres:16-alpine'], { stdio: 'pipe' });
  t.after(() => execFileSync('docker', ['rm', '-f', container], { stdio: 'pipe' }));
  for (let attempt = 0; ; attempt += 1) {
    try { sql('select 1'); break; } catch (error) {
      if (attempt >= 40) throw error;
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  sql(`create role anon; create role authenticated; create role service_role;
    create schema auth; create schema extensions; create extension pgcrypto with schema extensions;
    create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.jwt() returns jsonb language sql as $$select '{}'::jsonb$$;
    grant usage on schema auth to authenticated, anon;
    grant execute on function auth.uid(), auth.jwt() to authenticated, anon;`);
  const foundation = read('supabase/household-invitations-setup.sql');
  for (const file of ['supabase-setup.sql', 'supabase/households-setup.sql']) sql(read(file));
  sql(foundation);
  sql(`insert into auth.users values
    ('${uid(1)}','owner@example.com',now()), ('${uid(2)}','recipient@example.com',now()),
    ('${uid(3)}','wrong@example.com',now()), ('${uid(4)}','unconfirmed@example.com',null),
    ('${uid(5)}','concurrent@example.com',now());`);
  const household = asUser(1, "select public.create_household('Synthetic invitation household')");
  const invite = email => JSON.parse(asUser(1,
    `select row_to_json(i) from public.create_household_invitation('${household}', '${email}') i`));
  const accept = (user, token) => asUser(user,
    `select row_to_json(h) from public.accept_household_invitation('${token}') h`);
  const membershipCount = user => Number(sql(`select count(*) from public.household_members where household_id='${household}' and user_id='${uid(user)}'`));
  const pending = invitation => sql(`select accepted_at is null and accepted_by is null from public.household_invitations where id='${invitation.invitation_id}'`);
  sql(`update public.household_documents set data='{"shared":"keep this test data"}' where household_id='${household}'`);
  const first = invite('recipient@example.com');

  await t.test('wrong recipient, unverified email and anonymous callers cannot consume an invitation', () => {
    assert.equal(asUser(2, `select count(*) from public.household_documents where household_id='${household}'`), '0');
    assert.throws(() => accept(3, first.token), /different email address/);
    const unconfirmed = invite('unconfirmed@example.com');
    assert.throws(() => accept(4, unconfirmed.token), /Confirm your Homeboard email/);
    assert.throws(() => sql(`set role anon; select * from public.accept_household_invitation('${first.token}')`), /permission denied/);
    assert.throws(() => sql(`set role authenticated; select * from public.accept_household_invitation('${first.token}')`), /Authentication is required/);
    assert.equal(pending(first), 't');
    assert.equal(pending(unconfirmed), 't');
    assert.equal(membershipCount(2), 0);
    assert.equal(membershipCount(3), 0);
  });

  await t.test('verified recipient joins, receives shared access and can use the token only once', () => {
    const joined = JSON.parse(accept(2, first.token));
    assert.equal(joined.household_id, household);
    assert.equal(joined.household_name, 'Synthetic invitation household');
    assert.equal(membershipCount(2), 1);
    assert.equal(sql(`select role from public.household_members where household_id='${household}' and user_id='${uid(2)}'`), 'member');
    assert.equal(sql(`select accepted_at is not null and accepted_by='${uid(2)}' from public.household_invitations where id='${first.invitation_id}'`), 't');
    assert.match(asUser(2, `select data from public.household_documents where household_id='${household}'`), /keep this test data/);
    assert.throws(() => accept(2, first.token), /expired, revoked, or already used/);
    assert.equal(membershipCount(2), 1);
    assert.throws(() => asUser(2, `select * from public.create_household_invitation('${household}', 'someone@example.com')`), /Only a household owner/);
  });

  await t.test('joining again does not duplicate membership or downgrade an owner', () => {
    accept(2, invite('recipient@example.com').token);
    assert.equal(membershipCount(2), 1);
    accept(1, invite('owner@example.com').token);
    assert.equal(sql(`select role from public.household_members where household_id='${household}' and user_id='${uid(1)}'`), 'owner');
  });

  await t.test('revoked and expired invitations are rejected without granting access', () => {
    const revoked = invite('wrong@example.com');
    asUser(1, `select public.revoke_household_invitation('${revoked.invitation_id}')`);
    assert.throws(() => accept(3, revoked.token), /expired, revoked, or already used/);
    const expired = invite('wrong@example.com');
    sql(`update public.household_invitations set expires_at=now()-interval '1 minute' where id='${expired.invitation_id}'`);
    assert.throws(() => accept(3, expired.token), /expired, revoked, or already used/);
    assert.equal(membershipCount(3), 0);
  });

  await t.test('concurrent acceptance succeeds once and creates one membership', async () => {
    const invitation = invite('concurrent@example.com');
    const statement = queryAs(5, `select * from public.accept_household_invitation('${invitation.token}')`);
    const results = await Promise.allSettled([sqlAsync(statement), sqlAsync(statement)]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    const failed = results.find(result => result.status === 'rejected');
    assert.match(failed.reason.message, /expired, revoked, or already used/);
    assert.equal(membershipCount(5), 1);
  });

  await t.test('the upgrade fixes an existing pending token without changing household data', () => {
    // Reproduce the original deployed function to exercise a real upgrade,
    // not merely a fresh schema install. The row insertion must roll back.
    const currentFunction = foundation.match(/create or replace function public\.accept_household_invitation[\s\S]*?\$\$;/)[0];
    const originalFunction = currentFunction.replace('on conflict on constraint household_members_pkey do nothing;', 'on conflict (household_id, user_id) do nothing;');
    sql(originalFunction);
    const invitation = invite('wrong@example.com');
    assert.throws(() => accept(3, invitation.token), /column reference "household_id" is ambiguous/);
    assert.equal(pending(invitation), 't');
    assert.equal(membershipCount(3), 0);
    // The correction must coexist with the later account deletion migration.
    sql(read('supabase/account-data-setup.sql'));
    const correction = read('supabase/invitation-acceptance-fix.sql');
    sql(correction);
    sql(correction);
    assert.equal(JSON.parse(accept(3, invitation.token)).household_id, household);
    assert.equal(membershipCount(3), 1);
    assert.equal(sql(`select data->>'shared' from public.household_documents where household_id='${household}'`), 'keep this test data');
    assert.throws(() => sql(`set role anon; select * from public.accept_household_invitation('${invitation.token}')`), /permission denied/);
  });
});
