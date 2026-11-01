const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('fs');const {execFileSync}=require('child_process');
test('weekly database scopes recipients, protects RPC and deduplicates claims',{timeout:60000},async t=>{
 const container='homeboard-weekly-test-'+process.pid+'-'+Date.now();
 const sql=s=>execFileSync('docker',['exec','-i',container,'psql','-h','127.0.0.1','-U','postgres','-v','ON_ERROR_STOP=1','-Atq'],{input:s,encoding:'utf8',stdio:'pipe'}).trim();
 execFileSync('docker',['run','--detach','--rm','--pull=never','--name',container,'--network','none','-e','POSTGRES_HOST_AUTH_METHOD=trust','postgres:16-alpine'],{stdio:'pipe'});
 t.after(()=>execFileSync('docker',['rm','-f',container],{stdio:'pipe'}));
 for(let i=0;;i++){try{sql('select 1');break;}catch(e){if(i>40)throw e;await new Promise(r=>setTimeout(r,200));}}
 const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
 sql(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
 create table public.households(id uuid primary key);
 create table public.household_members(household_id uuid,user_id uuid);
 create table public.household_documents(household_id uuid,data jsonb);
 insert into public.households values('${id(1)}'),('${id(2)}');
 insert into auth.users values('${id(3)}','a@example.invalid',now()),('${id(4)}','b@example.invalid',now()),('${id(5)}','unverified@example.invalid',null);
 insert into public.household_members values('${id(1)}','${id(3)}'),('${id(1)}','${id(5)}'),('${id(2)}','${id(4)}');
 insert into public.household_documents values('${id(1)}','{"tasks":[]}'),('${id(2)}','{"tasks":[]}');`);
 const source=fs.readFileSync('supabase/weekly-summary-setup.sql','utf8');sql(source);sql(source);
 assert.throws(()=>sql('set role authenticated;select public.weekly_summary_batch(null)'),/permission denied/);
 const rows=JSON.parse(sql('set role service_role;select public.weekly_summary_batch(null)'));
 assert.deepEqual(rows.map(r=>r.recipients.map(u=>u.email)),[['a@example.invalid'],['b@example.invalid']]);
 assert.equal(JSON.parse(sql(`set role service_role;select public.weekly_summary_batch('${id(1)}')`)).length,1);
 const claim=`insert into public.homeboard_weekly_deliveries(household_id,user_id,week_start) values('${id(1)}','${id(3)}','2026-10-26') on conflict do nothing;`;
 sql('set role service_role;'+claim+claim);assert.equal(sql('select count(*) from public.homeboard_weekly_deliveries'),'1');
 sql(`delete from auth.users where id='${id(3)}'`);assert.equal(sql('select count(*) from public.homeboard_weekly_deliveries'),'0');
});
