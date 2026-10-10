const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {execFileSync}=require('node:child_process');
const container='homeboard-customer-access-'+process.pid+'-'+Date.now();
const args=['exec','-i',container,'psql','-U','postgres','-v','ON_ERROR_STOP=1','-Atq'];
const sql=text=>execFileSync('docker',args,{input:text,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const uid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const user=(n,query,session=n+100)=>sql(`begin;set local role authenticated;set local "request.jwt.claim.sub"='${uid(n)}';set local "request.jwt.claims"='{"session_id":"${uid(session)}"}';${query};commit;`);
test('customer access passes, private administration, short codes and email quotas', {timeout:120000},async t=>{
  execFileSync('docker',['run','--detach','--rm','--pull=never','--name',container,'--network','none','-e','POSTGRES_HOST_AUTH_METHOD=trust','postgres:16-alpine'],{stdio:'pipe'});
  t.after(()=>execFileSync('docker',['rm','-f',container],{stdio:'pipe'}));
  for(let i=0;;i++){try{sql('select 1');break;}catch(e){if(i>40)throw e;await new Promise(r=>setTimeout(r,200));}}
  sql(`create role anon;create role authenticated;create role service_role;create schema auth;create schema extensions;create extension pgcrypto with schema extensions;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz default now());
    create table auth.sessions(id uuid primary key,user_id uuid references auth.users on delete cascade);
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.jwt() returns jsonb language sql as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
    grant usage on schema auth to authenticated,anon;grant execute on function auth.uid(),auth.jwt() to authenticated,anon;`);
  for(const file of ['supabase-setup.sql','supabase/households-setup.sql','supabase/household-invitations-setup.sql','supabase/account-data-setup.sql','supabase/invitation-management-setup.sql'])sql(read(file));
  sql(`insert into auth.users(id,email) values('${uid(1)}','owner@example.invalid'),('${uid(2)}','member@example.invalid'),('${uid(3)}','admin@example.invalid'),('${uid(4)}','outsider@example.invalid');
    insert into auth.sessions values('${uid(101)}','${uid(1)}'),('${uid(102)}','${uid(2)}'),('${uid(103)}','${uid(3)}'),('${uid(104)}','${uid(4)}');insert into public.platform_admins values('${uid(3)}',now());`);
  const legacy=user(1,"select public.create_household('Existing')");
  sql(read('supabase/customer-release-development.sql'));
  sql(read('supabase/customer-release-development.sql'));
  const fresh=user(1,"select public.create_household('Fresh')");
  sql(`insert into public.household_members(household_id,user_id) values('${fresh}','${uid(2)}');`);
  const access=()=>JSON.parse(user(1,`select public.get_household_access('${fresh}')`));
  const claim=()=>JSON.parse(user(1,`select public.claim_free_household_pass('${fresh}')`));
  const approve=()=>JSON.parse(user(3,`select public.approve_household_pass('${fresh}')`));
  const redeem=(code,n=1)=>JSON.parse(user(n,`select public.redeem_household_pass('${fresh}','${code}')`));
  const write=(n=1)=>user(n,`update public.household_documents set data='{"tasks":[],"todos":[],"groceries":[]}' where household_id='${fresh}'`);
  await t.test('existing access survives repeat migration; new households start read-only',()=>{
    assert.equal(JSON.parse(user(1,`select public.get_household_access('${legacy}')`)).active,true);
    assert.equal(access().active,false);assert.equal(access().can_claim_free,true);
    assert.throws(()=>write(),/read-only/);assert.throws(()=>write(2),/read-only/);
    assert.equal(user(1,`select count(*) from public.household_documents where household_id='${fresh}'`),'1');
  });
  await t.test('ordinary members, outsiders and application admins cannot bypass household access or read content',()=>{
    assert.throws(()=>user(2,`select public.claim_free_household_pass('${fresh}')`),/Only the current household owner/);
    assert.throws(()=>user(1,`select public.approve_household_pass('${fresh}')`),/Platform administrator/);
    assert.throws(()=>user(1,`update public.household_access set expires_at=now()+interval '1 year'`),/permission denied/);
    assert.throws(()=>user(1,`select public.issue_homeboard_pass('${fresh}','owner@example.invalid','approved','${uid(1)}')`),/permission denied/);
    assert.equal(user(3,'select count(*) from public.household_documents'),'0');
    assert.equal(user(3,'select count(*) from public.planner_documents'),'0');
    assert.throws(()=>user(4,`select public.get_household_access('${fresh}')`),/membership is required/);
    assert.throws(()=>user(1,`select public.get_household_access('${fresh}')`,999),/Sign in again/);
  });
  await t.test('first free pass activates six calendar months, once, for its verified owner',()=>{
    const pass=claim();assert.match(pass.code,/^[A-F0-9]{32}$/);assert.equal(pass.duration_months,6);
    assert.equal(sql(`select token_hash='${pass.code}' from public.household_access_passes where id='${pass.pass_id}'`),'f');
    assert.throws(()=>redeem(pass.code,2),/Only the current household owner/);
    assert.equal(redeem(pass.code).active,true);write();write(2);
    assert.throws(()=>redeem(pass.code),/already used/);assert.throws(claim,/Renewal requires approval/);
    assert.equal(sql(`select expires_at between now()+interval '5 months' and now()+interval '7 months' from public.household_access where household_id='${fresh}'`),'t');
    assert.equal(sql(`select expires_at=activated_at+interval '6 months' and expires_at>now()+interval '1 minute' from public.household_access where household_id='${fresh}'`),'t');
  });
  await t.test('approved early renewal adds six months; expiry stops writes but retains reads and late renewal restores access',()=>{
    const before=access().expires_at;redeem(approve().code);
    assert.equal(sql(`select expires_at='${before}'::timestamptz+interval '6 months' from public.household_access where household_id='${fresh}'`),'t');
    sql(`update public.household_access set expires_at=now()-interval '1 day' where household_id='${fresh}'`);
    assert.throws(()=>write(),/read-only/);assert.equal(user(2,`select count(*) from public.household_documents where household_id='${fresh}'`),'1');
    const late=redeem(approve().code);assert.equal(late.active,true);write();
    assert.equal(sql(`select expires_at between now()+interval '5 months' and now()+interval '7 months' from public.household_access where household_id='${fresh}'`),'t');
  });
  await t.test('short invitation codes rotate, verify the email and work once',()=>{
    const created=JSON.parse(user(1,`select public.create_email_invitation('${fresh}','outsider@example.invalid')`));
    assert.match(created.code,/^[A-F0-9]{16}$/);
    const renewed=JSON.parse(user(1,`select public.renew_email_invitation('${fresh}','${created.invitation_id}')`));
    assert.notEqual(created.code,renewed.code);
    assert.throws(()=>user(4,`select * from public.accept_household_code('${created.code}')`),/invalid/);
    assert.throws(()=>user(2,`select * from public.accept_household_code('${renewed.code}')`),/invalid/);
    assert.match(user(4,`select * from public.accept_household_code('${renewed.code}')`),/Fresh/);
    assert.throws(()=>user(4,`select * from public.accept_household_code('${renewed.code}')`),/invalid/);
  });
  await t.test('email recipients come from membership; request keys deduplicate and quotas stop repeated requests',()=>{
    const prepare=(key,n=1)=>JSON.parse(user(n,`select public.prepare_household_email('${fresh}','notify','${key}')`));
    const first=prepare('synthetic-key-1');assert.deepEqual(first.recipients.sort(),['member@example.invalid','outsider@example.invalid']);
    assert.equal(prepare('synthetic-key-1').duplicate,true);
    for(let i=2;i<=5;i++)prepare('synthetic-key-'+i);
    assert.throws(()=>prepare('synthetic-key-6'),/Too many email/);
    assert.throws(()=>prepare('synthetic-admin-key',3),/membership is required/);
  });
  await t.test('account access export omits codes and hashes; deletion removes the recipient records while a shared household survives',()=>{
    const exported=JSON.parse(user(1,'select public.export_my_access_records()'));
    assert.ok(exported.passes.length);assert.doesNotMatch(JSON.stringify(exported),/token_hash|request_key/);
    assert.equal(JSON.parse(user(2,'select public.export_my_access_records()')).passes.length,0);
    sql(`update auth.users set email='renamed-owner@example.invalid' where id='${uid(1)}'`);
    assert.equal(JSON.parse(user(1,'select public.export_my_access_records()')).passes.length,exported.passes.length);
    sql(`insert into auth.users(id,email) values('${uid(5)}','removed@example.invalid');
      insert into public.household_members(household_id,user_id) values('${fresh}','${uid(5)}');
      select public.issue_homeboard_pass('${fresh}','removed@example.invalid','approved','${uid(3)}');`);
    assert.equal(sql("select count(*) from public.household_access_passes where email='removed@example.invalid'"),'1');
    sql(`update auth.users set email='changed-before-deletion@example.invalid' where id='${uid(5)}';delete from auth.users where id='${uid(5)}'`);
    assert.equal(sql("select count(*) from public.household_access_passes where email='removed@example.invalid'"),'0');
    assert.equal(sql(`select count(*) from public.household_documents where household_id='${fresh}'`),'1');
  });
  await t.test('operator sees a pending renewal and its expiry without receiving planner content',()=>{
    sql(`insert into public.homeboard_email_requests(user_id,household_id,request_key,operation) values('${uid(1)}','${fresh}','renewal-for-admin-test','request-renewal')`);
    assert.throws(()=>user(1,'select public.list_platform_household_access()'),/Platform administrator/);
    const rows=JSON.parse(user(3,'select public.list_platform_household_access()'));
    assert.equal(rows.find(row=>row.household_id===fresh).renewal_requested,true);
    assert.doesNotMatch(JSON.stringify(rows),/tasks|groceries|planner|token_hash/);
    approve();
    assert.equal(JSON.parse(user(3,'select public.list_platform_household_access()')).find(row=>row.household_id===fresh).renewal_requested,false);
  });
});
