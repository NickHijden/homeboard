const {test}=require('node:test');const assert=require('node:assert/strict');
async function fixture(overrides={}){
 const {createHouseholdEmailHandler}=await import('../supabase/functions/household-email/handler.mjs');const calls=[];
 const state={duplicate:false,denied:false,unconfirmed:false,providerFails:false,...overrides};
 const fetchImpl=async(url,options)=>{
  const data=options.body?JSON.parse(options.body):null;calls.push({url,options,data});let result={},status=200;
  if(url.endsWith('/auth/v1/user'))result={id:'synthetic',email_confirmed_at:state.unconfirmed?null:'2026-10-01'};
  if(url.endsWith('/prepare_household_email')){if(state.denied){status=403;result={message:'Household membership is required'};}else result={request_id:'synthetic-request',duplicate:state.duplicate,recipients:['member@example.invalid']};}
  if(url.endsWith('/create_email_invitation')||url.endsWith('/renew_email_invitation'))result={token:'synthetic-token',code:'ABCDEF0011223344',invited_email:'invitee@example.invalid'};
  if(url.endsWith('/claim_free_household_pass')||url.endsWith('/approve_household_pass'))result={code:'SYNTHETIC-CODE',email:'owner@example.invalid',duration_months:6};
  if(url.startsWith('https://api.brevo.com')&&state.providerFails)status=503;
  return new Response(JSON.stringify(result),{status});
 };
 const handler=createHouseholdEmailHandler({url:'https://synthetic.supabase.co',publicKey:'public-test',serviceKey:'service-test',brevoKey:'brevo-test',fromEmail:'sender@example.invalid',siteUrl:'https://example.invalid/dev/',operatorEmail:'operator@example.invalid',origins:['https://example.invalid'],fetchImpl});
 const request=(body={action:'notify',household_id:'home-test',request_id:'synthetic-request'},options={})=>new Request('https://edge.invalid',{method:'POST',headers:{origin:'https://example.invalid',authorization:'Bearer synthetic','content-type':'application/json',...options.headers},body:JSON.stringify(body),...options});
 return{calls,state,handler,request};
}
test('delivery resolves recipients server-side and keeps planner details out of messages',async()=>{
 const f=await fixture();const result=await f.handler(f.request({action:'notify',household_id:'home-test',change:'updated',title:'SECRET PLANNER TITLE'}));assert.equal(result.status,200);
 const sent=f.calls.find(c=>c.url.startsWith('https://api.brevo.com'));assert.deepEqual(sent.data.to,[{email:'member@example.invalid'}]);assert.doesNotMatch(JSON.stringify(sent.data),/SECRET PLANNER TITLE/);
 assert.equal(f.calls.find(c=>c.url.endsWith('/prepare_household_email')).options.headers.Authorization,'Bearer synthetic');
});
test('unverified users, outsiders, unapproved origins and arbitrary recipients cannot send',async()=>{
 for(const state of [{denied:true},{unconfirmed:true}]){const f=await fixture(state);assert.ok((await f.handler(f.request())).status>=400);assert.equal(f.calls.some(c=>c.url.startsWith('https://api.brevo.com')),false);}
 const f=await fixture();assert.equal((await f.handler(f.request({action:'notify',household_id:'home-test',recipients:['victim@example.invalid']}))).status,400);
 assert.equal((await f.handler(new Request('https://edge.invalid',{method:'POST',headers:{origin:'https://evil.invalid'}}))).status,403);assert.equal(f.calls.length,0);
});
test('duplicate requests do not email twice; large bodies and missing auth are rejected',async()=>{
 const f=await fixture({duplicate:true});const response=await f.handler(f.request());assert.equal((await response.json()).duplicate,true);assert.equal(f.calls.some(c=>c.url.startsWith('https://api.brevo.com')),false);
 assert.equal((await f.handler(f.request({action:'notify',household_id:'x'.repeat(9000)}))).status,413);
 assert.equal((await f.handler(new Request('https://edge.invalid',{method:'POST'}))).status,401);
});
test('invitations have the configured live link and manual fallback when provider delivery fails',async()=>{
 const f=await fixture({providerFails:true});const result=await (await f.handler(f.request({action:'invite',household_id:'home-test',email:'invitee@example.invalid'}))).json();
 assert.equal(result.sent,0);assert.equal(result.invitation.code,'ABCDEF0011223344');assert.match(result.message,/could not be confirmed/);
 const email=f.calls.find(c=>c.url.startsWith('https://api.brevo.com'));assert.match(email.data.textContent,/https:\/\/example.invalid\/dev\/\?invite=synthetic-token/);
});
test('pass emails use owner identity returned by the permission-checked RPC',async()=>{
 const f=await fixture();const response=await f.handler(f.request({action:'approve-pass',household_id:'home-test'}));assert.equal(response.status,200);
 const email=f.calls.find(c=>c.url.startsWith('https://api.brevo.com'));assert.deepEqual(email.data.to,[{email:'owner@example.invalid'}]);assert.match(email.data.textContent,/6-month/);assert.match(email.data.textContent,/activate=SYNTHETIC-CODE/);
});
