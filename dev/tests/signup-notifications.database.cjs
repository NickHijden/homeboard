const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),{execFileSync}=require('child_process');
test('signup claims are private, once per new account, reinstallation-safe and cleaned on deletion',{timeout:60000},async t=>{
 const container='homeboard-signup-test-'+process.pid+'-'+Date.now();
 const sql=s=>execFileSync('docker',['exec','-i',container,'psql','-h','127.0.0.1','-U','postgres','-v','ON_ERROR_STOP=1','-Atq'],{input:s,encoding:'utf8',stdio:'pipe'}).trim();
 execFileSync('docker',['run','--detach','--rm','--pull=never','--name',container,'--network','none','-e','POSTGRES_HOST_AUTH_METHOD=trust','postgres:16-alpine'],{stdio:'pipe'});
 t.after(()=>execFileSync('docker',['rm','-f',container],{stdio:'pipe'}));
 for(let i=0;;i++){try{sql('select 1');break;}catch(e){if(i>40)throw e;await new Promise(r=>setTimeout(r,200));}}
 const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
 sql('create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,created_at timestamptz,email_confirmed_at timestamptz);');
 sql("insert into auth.users values('"+id(1)+"','old@example.invalid',now()-interval '1 day',now())");
 const source=fs.readFileSync('supabase/signup-notifications-setup.sql','utf8');sql(source);
 const start=sql('select enabled_at from public.homeboard_signup_notification_settings');sql(source);
 assert.equal(sql('select enabled_at from public.homeboard_signup_notification_settings'),start);
 for(const role of ['anon','authenticated']){
  assert.throws(()=>sql('set role '+role+';select public.claim_homeboard_signup_notification()'),/permission denied/);
  assert.throws(()=>sql('set role '+role+';select * from public.homeboard_signup_notifications'),/permission denied/);
 }
 assert.equal(sql('set role service_role;select public.claim_homeboard_signup_notification()'),'');
 sql("insert into auth.users values('"+id(2)+"','new@example.invalid',now(),null),('"+id(3)+"','',now(),null)");
 const claim=JSON.parse(sql('set role service_role;select public.claim_homeboard_signup_notification()'));
 assert.equal(claim.email,'new@example.invalid');assert.equal(claim.confirmed,false);
 assert.equal(sql('set role service_role;select public.claim_homeboard_signup_notification()'),'');
 sql("update auth.users set email_confirmed_at=now() where id='"+id(2)+"'");
 assert.equal(sql('set role service_role;select public.claim_homeboard_signup_notification()'),'');
 sql("delete from auth.users where id='"+id(2)+"'");
 assert.equal(sql('select count(*) from public.homeboard_signup_notifications'),'0');
});
