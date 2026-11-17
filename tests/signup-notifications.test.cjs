const {test}=require('node:test'),assert=require('node:assert/strict');
const projects=['https://yflzmwriknvxhwhaetuk.supabase.co','https://axfxuqihsscjekicbgkk.supabase.co'];
const request=()=>new Request('https://edge.invalid',{method:'POST',headers:{'x-homeboard-cron-secret':'test-secret'},body:JSON.stringify({to:'attacker@example.invalid'})});
test('signup mail uses authoritative records, fixed operator recipient, environment labels and no duplicate claims',async()=>{
 const {createSignupNotificationHandler}=await import('../supabase/functions/signup-notifications/handler.mjs');
 for(const [index,url] of projects.entries()){
  const mails=[],statuses=[];let claimed=false;
  const handler=createSignupNotificationHandler({url,serviceKey:'s',cronSecret:'test-secret',brevoKey:'b',fromEmail:'sender@example.invalid',fetchImpl:async(u,o)=>{
   if(u.includes('/rpc/')){const data=claimed?null:{id:'u1',email:'new@example.invalid',created_at:'2026-11-17T12:00:00Z',confirmed:false};claimed=true;return Response.json(data);}
   if(u.includes('api.brevo.com')){mails.push(JSON.parse(o.body));return Response.json({}, {status:201});}
   statuses.push(JSON.parse(o.body));return new Response(null,{status:204});
  }});
  assert.equal((await handler(new Request('https://edge.invalid',{method:'POST'}))).status,401);assert.equal(claimed,false);
  assert.equal((await (await handler(request())).json()).accepted,1);
  assert.equal((await (await handler(request())).json()).accepted,0);
  assert.equal(mails.length,1);assert.deepEqual(mails[0].to,[{email:'nickyjim@live.nl'}]);
  assert.match(mails[0].subject,index?/Development/:/Production/);
  assert.match(mails[0].textContent,/new@example.invalid/);assert.match(mails[0].textContent,/Nog niet/);
  assert.doesNotMatch(mails[0].textContent,/https?:|password|attacker/);
  assert.deepEqual(statuses,[{status:'accepted',provider_status:201}]);
 }
});
test('provider rejection and timeout remain recorded without unsafe automatic retry',async()=>{
 const {createSignupNotificationHandler}=await import('../supabase/functions/signup-notifications/handler.mjs');
 for(const timeout of [false,true]){
  let count=0,status;
  const handler=createSignupNotificationHandler({url:projects[0],serviceKey:'s',cronSecret:'test-secret',brevoKey:'b',fromEmail:'sender@example.invalid',fetchImpl:async(u,o)=>{
   if(u.includes('/rpc/'))return Response.json(count++?null:{id:'u',email:'new@example.invalid',created_at:'2026-11-17T12:00:00Z',confirmed:true});
   if(u.includes('api.brevo.com')){if(timeout)throw Error('timeout');return Response.json({},{status:503});}
   status=JSON.parse(o.body).status;return new Response(null,{status:204});
  }});
  assert.equal((await (await handler(request())).json()).failed,1);assert.equal(status,timeout?'unknown':'failed');
 }
});


test('dashboard registers the private worker and unknown projects fail before claiming',async()=>{
 const fs=require('fs'),vm=require('vm');let handler;
 const context=vm.createContext({Response,Request,Intl,Date,AbortSignal,fetch:()=>{throw Error('Unexpected network')},Deno:{env:{get:key=>key==='HOMEBOARD_WEEKLY_CRON_SECRET'?'test-secret':key==='SUPABASE_URL'?'https://unknown.invalid':'test'},serve:fn=>handler=fn}});
 vm.runInContext(fs.readFileSync('supabase/functions/signup-notifications/dashboard.ts','utf8'),context);
 assert.equal((await handler(request())).status,503);
});
