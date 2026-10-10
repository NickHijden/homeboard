// Synthetic customer journey on the public Development URL. No live requests.
const {test,before,after}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');const base='https://nickhijden.github.io/homeboard/dev/';const project='https://axfxuqihsscjekicbgkk.supabase.co';
const profile={members:[{id:'me',name:'Alex'},{id:'partner',name:'Taylor'}],updatedAt:'2026-10-08T12:00:00Z'};
const blank=()=>({tasks:[],todos:[],groceries:[],completions:{},anyDayCompletions:[],daySettings:{},profile:structuredClone(profile),meta:{demo:false,footballScheduleVersion:'20260922-v1'}});
let browser;before(async()=>{browser=await chromium.launch({channel:'msedge',headless:true});});after(async()=>browser?.close());
async function open(t,options={}){
  const context=await browser.newContext({serviceWorkers:'block',viewport:options.phone?{width:390,height:844}:{width:1366,height:1000},isMobile:Boolean(options.phone),hasTouch:Boolean(options.phone),...(options.phone?{userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 Version/16.0 Mobile/15E148 Safari/604.1'}:{})});t.after(()=>context.close());
  const cloud={data:blank(),requests:[],expired:false,offline:false,failWrite:false,...options.cloud};
  const errors=[];context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));t.after(()=>assert.deepEqual(errors,[]));
  await context.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());
    if(req.url().startsWith(base)){
      const file=url.pathname.slice(new URL(base).pathname.length)||'index.html';
      if(!/^(index\.html|[a-z-]+\.js|styles\.css|privacy\.html|manifest\.webmanifest|assets\/homeboard-[a-z0-9-]+\.png)$/.test(file))return route.abort();
      return route.fulfill({contentType:({'.js':'text/javascript','.html':'text/html','.css':'text/css','.png':'image/png'})[path.extname(file)]||'application/json',body:fs.readFileSync(path.join(root,file))});
    }
    if(url.origin!==project)return route.abort();
    const r={path:url.pathname,url:req.url(),method:req.method(),body:req.postDataJSON()};cloud.requests.push(r);
    if(cloud.offline)return route.abort('internetdisconnected');let data=[];
    if(r.path.endsWith('/list_my_households'))data=[{household_id:'home-a',household_name:'Synthetic home',role:'owner'}];
    if(r.path.endsWith('/is_platform_admin'))data=false;
    if(r.path==='/auth/v1/user'){
      if(cloud.invalidRecovery)return route.fulfill({status:401,contentType:'application/json',body:'{"message":"Expired token"}'});
      data={id:'recovery-user',email:'recovery@example.invalid'};
    }
    if(r.path.endsWith('/get_household_access'))data={expires_at:cloud.expired||cloud.pendingActivation?'2026-10-01T12:00:00Z':'2027-04-09T12:00:00Z',active:!cloud.expired&&!cloud.pendingActivation,can_claim_free:Boolean(cloud.pendingActivation)};
    if(r.path.endsWith('/redeem_household_pass')){cloud.expired=false;cloud.pendingActivation=false;data={active:true,expires_at:'2027-04-09T12:00:00Z'};}
    if(r.path==='/rest/v1/household_documents'){
      if(r.method==='GET')data=[{household_id:'home-a',data:structuredClone(cloud.data)}];
      else{if(cloud.delayWrites)await new Promise(resolve=>setTimeout(resolve,cloud.delayWrites));if(cloud.failWrite)return route.fulfill({status:503,contentType:'application/json',body:'{"message":"Synthetic save failed"}'});cloud.data=structuredClone(r.body.data);}
    }
    if(r.path==='/functions/v1/household-email')data={message:'Email accepted for delivery.',sent:1};
    return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
  });
  await context.addInitScript(({project,loggedIn})=>{
    if(location.origin!=='https://nickhijden.github.io'||!loggedIn||localStorage.getItem('customer-test-init'))return;localStorage.setItem('customer-test-init','1');
    const user={id:'customer-test-user',email:'owner@example.invalid'};
    const token='test.'+btoa(JSON.stringify({iss:project+'/auth/v1'}))+'.test';
    localStorage.setItem('homeboard-sync-session-v1-staging',JSON.stringify({user,access_token:token,refresh_token:'synthetic',expires_at:2000000000}));
  },{project,loggedIn:options.loggedIn!==false});
  const page=await context.newPage();page.setDefaultTimeout(8000);await page.clock.setFixedTime(new Date('2026-10-09T12:00:00Z'));
  await page.goto(base+(options.query||''));
  if(options.loggedIn!==false && !options.query?.includes('demo'))await page.waitForFunction(()=>householdState.loaded&&!syncState.busy&&customerState.access[activePlannerScope]);
  return {page,context,cloud};
}
test('signed-out personal board is gated, demo is isolated and makes no cloud requests',async t=>{
  const {page,cloud}=await open(t,{loggedIn:false});
  assert.equal(await page.locator('#accountGate').isVisible(),true);assert.equal(await page.locator('#taskOverviewButton').isVisible(),false);
  await page.getByRole('link',{name:'Try the demo'}).click();await page.waitForFunction(()=>typeof IS_DEMO_HOST!=='undefined' && IS_DEMO_HOST);
  assert.equal(await page.locator('#accountGate').isVisible(),false);assert.equal(await page.evaluate(()=>state.data.tasks.length),2);
  assert.equal(cloud.requests.length,0);assert.match(await page.evaluate(()=>STORAGE_NAMESPACE),/staging-demo/);
  if(process.env.HOMEBOARD_SCREENSHOT_DIR){fs.mkdirSync(process.env.HOMEBOARD_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.HOMEBOARD_SCREENSHOT_DIR,'demo-board.png'),fullPage:true});}
});
test('names and Together assignments appear once and hostile names remain plain text',async t=>{
  const data=blank();data.tasks=[{id:'shared-task',title:'One shared chore',kind:'task',assignee:'both',anyDay:true,anyDayDate:'2026-10-05',nextAnyDayDate:'2026-10-05',recurrence:'weekly',recurrenceStartDate:'2026-10-05',updatedAt:'2026-10-08'}];
  const {page}=await open(t,{cloud:{data}});
  assert.equal(await page.locator('#anyDayBoard .task-check').count(),1);
  await page.locator('#settingsButton').click();await page.locator('#householdPeople').locator('..').locator('summary').click();
  await page.locator('#householdPeople').fill('Alex renamed\n<img src=x onerror=alert(1)>');await page.locator('#saveHouseholdPeople').click();
  assert.equal(await page.evaluate(()=>state.data.profile.members[0].id),'me');
  await page.evaluate(()=>{state.data.tasks[0].assignee='partner';render();});
  assert.equal(await page.locator('#anyDayBoard img').count(),0);
  assert.match(await page.locator('#anyDayBoard').innerText(),/<img src=x/);
  await page.evaluate(()=>{state.data.profile.members.splice(1,1);render();});
  assert.equal(await page.locator('#anyDayBoard .task-check').count(),1);
  assert.match(await page.locator('#anyDayBoard').innerText(),/Former member/);
  await page.locator('#closeSettingsButton').click();await page.locator('#addTaskButton').click();
  assert.match(await page.locator('#taskAssignee').innerText(),/Alex renamed/);assert.equal(await page.locator('#taskAssignee img').count(),0);
});
test('recording actual completion schedules four weeks from that date and survives reload',async t=>{
  const {page,cloud}=await open(t);
  await page.locator('#addTaskButton').click();await page.locator('#taskTitle').fill('Filter change');
  await page.locator('#taskRepeat').selectOption('fourweekly');await page.locator('#taskCompletedOn').fill('2026-10-02');
  await page.locator('#taskRotate').check();await page.locator('#taskAssignee').selectOption('me');
  await page.locator('#taskForm').evaluate(form=>form.requestSubmit());
  await page.waitForFunction(()=>state.data.tasks.some(t=>t.title==='Filter change'));
  assert.equal(await page.evaluate(()=>state.data.tasks[0].date),'2026-10-30');
  assert.equal(await page.evaluate(()=>state.data.tasks[0].lastCompletedOn),'2026-10-02');
  await page.evaluate(async()=>{while(syncState.busy)await new Promise(resolve=>setTimeout(resolve,25));return syncNow(false);});assert.equal(cloud.data.tasks[0].date,'2026-10-30');
  await page.reload();await page.waitForFunction(()=>!syncState.busy&&householdState.loaded);assert.equal(await page.evaluate(()=>state.data.tasks[0].date),'2026-10-30');
});
test('expired boards retain data, block edits and writes, and resume only after redemption',async t=>{
  const data=blank();data.todos=[{id:'kept',title:'Keep this task',completed:false}];
  const {page,cloud}=await open(t,{cloud:{data,expired:true}});
  assert.equal(await page.locator('#accessBanner').isVisible(),true);
  await page.evaluate(()=>completeTask('kept','2026-10-09','Kept'));
  assert.deepEqual(await page.evaluate(()=>state.data.completions),{});
  await page.evaluate(()=>syncNow(false));assert.equal(cloud.requests.some(r=>r.path==='/rest/v1/household_documents'&&r.method!=='GET'),false);
  assert.equal(await page.evaluate(()=>Boolean(syncState.session)),true);
  await page.locator('#settingsButton').click();await page.locator('#householdAccessOptions > summary').click();await page.locator('#accessPassCode').fill('SYNTHETIC-CODE');await page.locator('#redeemPassButton').click();
  await page.waitForFunction(()=>plannerIsWritable());assert.equal(await page.evaluate(()=>state.data.todos[0].title),'Keep this task');
});

test('an emailed first-pass link opens activation and keeps six-month access through polling and reload',async t=>{
  const data=blank();data.todos=[{id:'keep-draft',title:'Keep my household task',completed:false}];
  const {page,cloud}=await open(t,{query:'?activate=SYNTHETIC-FIRST-PASS&household=home-a',cloud:{data,pendingActivation:true}});
  assert.equal(await page.locator('#settingsDialog').isVisible(),true);
  assert.equal(await page.locator('#householdAccessOptions').getAttribute('open'),'');
  assert.equal(await page.locator('#accessPassCode').inputValue(),'SYNTHETIC-FIRST-PASS');
  assert.match(await page.locator('#householdAccessStatus').innerText(),/Activation required.*has not started/);
  assert.doesNotMatch(await page.locator('#accessBanner').innerText(),/expired|renew/i);
  assert.equal(await page.locator('#requestRenewalButton').isDisabled(),true);
  assert.equal(cloud.requests.some(r=>r.path==='/rest/v1/household_documents'&&r.method!=='GET'),false);
  await page.locator('#redeemPassButton').click();
  await page.waitForFunction(()=>plannerIsWritable()&&!location.search);
  assert.match(await page.locator('#customerFeatureStatus').innerText(),/activated until/);
  const expiry=await page.evaluate(()=>customerState.access[activePlannerScope].expires_at);
  assert.equal(expiry,'2027-04-09T12:00:00Z');
  await page.clock.setFixedTime(new Date('2026-10-09T12:02:00Z'));
  await page.evaluate(async()=>{await refreshHouseholdAccess();await syncNow(false);renderCustomerFeatures();});
  assert.equal(await page.evaluate(()=>plannerIsWritable()),true);
  assert.equal(await page.evaluate(()=>Boolean(syncState.session)),true);
  assert.equal(await page.evaluate(()=>customerState.access[activePlannerScope].expires_at),expiry);
  await page.reload();await page.waitForFunction(()=>householdState.loaded&&!syncState.busy&&plannerIsWritable());
  assert.equal(await page.evaluate(()=>customerState.access[activePlannerScope].expires_at),expiry);
  assert.equal(await page.evaluate(()=>state.data.todos[0].title),'Keep my household task');
  assert.equal(cloud.requests.filter(r=>r.path.endsWith('/redeem_household_pass')).length,1);
});
test('notification is sent only after successful cloud sync',async t=>{
  const {page,cloud}=await open(t);
  await page.evaluate(()=>{state.data.todos.push({id:'change',title:'Synthetic',updatedAt:nowIso()});persist({sync:false});});
  cloud.failWrite=true;await page.evaluate(()=>notifyPlannerChange('change',false));
  assert.equal(cloud.requests.some(r=>r.path==='/functions/v1/household-email'),false);
  cloud.failWrite=false;await page.evaluate(()=>notifyPlannerChange('change',true));
  assert.equal(cloud.requests.filter(r=>r.path==='/functions/v1/household-email').length,1);
});
test('a notification waits for a background save already in progress',async t=>{
  const {page,cloud}=await open(t,{cloud:{delayWrites:200}});
  await page.evaluate(async()=>{state.data.todos.push({id:'background-change',title:'Background save',updatedAt:nowIso()});persist({sync:false});syncNow(false);await notifyPlannerChange('background-change',false);});
  assert.equal(cloud.requests.filter(r=>r.path==='/functions/v1/household-email').length,1);
  assert.equal(cloud.data.todos[0].title,'Background save');
});
test('phone overview keeps viewport through edits, offers stacked view and iOS install guidance',async t=>{
  const {page}=await open(t,{phone:true});const initial=await page.locator('meta[name=viewport]').getAttribute('content');assert.match(initial,/width=1024/);assert.match(initial,/user-scalable=yes/);
  await page.evaluate(()=>render());assert.equal(await page.locator('meta[name=viewport]').getAttribute('content'),initial);
  await page.locator('#settingsButton').click();await page.locator('#installButton').click();assert.match(await page.locator('#installInstructions').innerText(),/Share menu/);await page.locator('#closeInstallButton').click();
  await page.locator('#phoneLayout').locator('..').locator('summary').click();await page.locator('#phoneLayout').selectOption('responsive');await page.locator('#boardTextSize').selectOption('large');await page.locator('#saveDisplayButton').click();
  assert.match(await page.locator('meta[name=viewport]').getAttribute('content'),/width=device-width/);assert.equal(await page.locator('html').getAttribute('data-text-size'),'large');
  if(process.env.HOMEBOARD_SCREENSHOT_DIR){fs.mkdirSync(process.env.HOMEBOARD_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.HOMEBOARD_SCREENSHOT_DIR,'phone-settings.png'),fullPage:true});}
});
test('cached household access permits offline work only until its expiry',async t=>{
  const {page,cloud}=await open(t);cloud.offline=true;await page.reload();
  await page.waitForFunction(()=>Boolean(customerState.access[activePlannerScope]));
  assert.equal(await page.evaluate(()=>plannerIsWritable()),true);
  await page.clock.setFixedTime(new Date('2027-04-10T12:00:00Z'));assert.equal(await page.evaluate(()=>plannerIsWritable()),false);
});
test('quiet evening dims the calendar on schedule and restores daylight styling afterwards',async t=>{
  const {page}=await open(t);
  await page.clock.setFixedTime(new Date('2026-10-09T22:00:00'));
  await page.evaluate(()=>{customerState.preferences={quietEnabled:true,quietStart:'21:00',quietEnd:'07:00'};applyDisplayPreferences(false);});
  assert.equal(await page.locator('html').evaluate(el=>el.classList.contains('quiet-evening')),true);
  assert.equal(await page.locator('.day-timeline').first().evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(40, 44, 60)');
  if(process.env.HOMEBOARD_SCREENSHOT_DIR){fs.mkdirSync(process.env.HOMEBOARD_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.HOMEBOARD_SCREENSHOT_DIR,'quiet-board.png'),fullPage:true});}
  await page.clock.setFixedTime(new Date('2026-10-10T12:00:00'));await page.evaluate(()=>applyDisplayPreferences(false));
  assert.equal(await page.locator('html').evaluate(el=>el.classList.contains('quiet-evening')),false);
});
test('forgotten password uses the correct environment and never claims an account exists',async t=>{
  const {page,cloud}=await open(t,{loggedIn:false,query:'?invite=synthetic-invitation'});
  await page.locator('#settingsButton').click();await page.locator('#syncEmail').fill('recovery@example.invalid');await page.locator('#forgotPasswordButton').click();
  await page.waitForFunction(()=>document.querySelector('#syncStatus').textContent.includes('If this email has an account'));
  const request=cloud.requests.find(r=>r.path==='/auth/v1/recover');assert.deepEqual(request.body,{email:'recovery@example.invalid'});
  assert.equal(new URL(request.url).searchParams.get('redirect_to'),base+'?invite=synthetic-invitation');
});
test('recovery validates the email link, requires matching passwords and keeps household data untouched',async t=>{
  const {page,cloud}=await open(t,{loggedIn:false,query:'#type=recovery&access_token=synthetic-recovery-token&refresh_token=synthetic-refresh'});
  await page.waitForFunction(()=>customerState.recovery && customerState.recovery.verified);
  assert.equal(new URL(page.url()).hash,'');assert.match(await page.locator('#passwordRecoveryIdentity').innerText(),/recovery@example.invalid/);
  await page.locator('#recoveryPassword').fill('new-test-password');await page.locator('#recoveryPasswordAgain').fill('different-password');await page.locator('#saveRecoveryPassword').click();
  assert.equal(cloud.requests.some(r=>r.method==='PUT'),false);
  await page.locator('#recoveryPasswordAgain').fill('new-test-password');await page.locator('#saveRecoveryPassword').click();
  await page.waitForFunction(()=>!customerState.recovery);
  assert.equal(cloud.requests.filter(r=>r.method==='PUT').length,1);assert.equal(await page.locator('#recoveryPassword').inputValue(),'');
  assert.equal(cloud.requests.some(r=>r.path.includes('household_documents')),false);
  assert.equal(await page.evaluate(()=>Object.values(localStorage).some(x=>x.includes('synthetic-recovery-token'))),false);
});
test('expired recovery links cannot change a password',async t=>{
  const {page,cloud}=await open(t,{loggedIn:false,query:'#type=recovery&access_token=expired-token',cloud:{invalidRecovery:true}});
  await page.waitForFunction(()=>document.querySelector('#passwordRecoveryStatus').textContent.includes('expired'));
  assert.equal(await page.locator('#saveRecoveryPassword').isDisabled(),true);await page.locator('#cancelPasswordRecovery').click();
  assert.equal(cloud.requests.some(r=>r.method==='PUT'),false);assert.equal(await page.evaluate(()=>customerState.recovery),null);
});
