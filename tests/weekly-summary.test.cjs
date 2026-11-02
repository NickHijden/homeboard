const {test}=require('node:test');const assert=require('node:assert/strict');
const recurrence=require('../recurrence.js');
const task=(id,extra={})=>({id,title:id,kind:'task',anyDay:true,anyDayDate:'2026-10-26',date:'2026-10-26',recurrence:'weekly',...extra});
test('missed history retains original weeks after completion and excludes completed tasks/events',()=>{
 const data={tasks:[task('open'),task('done'),task('event',{kind:'event'}),task('fixed',{anyDay:false})],anyDayCompletions:[{taskId:'done',occurrenceDate:'2026-10-26',completedDate:'2026-10-26',completedAt:'2026-10-26T10:00:00Z',nextAnyDayDate:'2026-11-02'}],completions:{}};
 const rows=recurrence.missedHistory(data,new Date(2026,10,2));assert.deepEqual(rows.map(r=>r.taskId),['open']);
 data.missedOccurrences=rows;data.anyDayCompletions.push({taskId:'open',occurrenceDate:'2026-10-26',completedDate:'2026-11-02',completedAt:'2026-11-02T10:00:00Z',nextAnyDayDate:'2026-11-09'});
 assert.deepEqual(recurrence.missedHistory(data,new Date(2026,10,2)),rows);
});
test('flexible completion history prevents stale due dates creating missed tasks',()=>{
 const data={tasks:[task('flex',{anyDay:true,anyDayDate:'2026-10-26',nextAnyDayDate:'2026-10-26',recurrence:'fourweekly'})],anyDayCompletions:[{taskId:'flex',occurrenceDate:'2026-10-26',completedDate:'2026-10-28',completedAt:'2026-10-28T10:00:00Z',nextAnyDayDate:'2026-11-25'}]};
 assert.equal(recurrence.missedHistory(data,new Date(2026,10,2)).length,0);
 assert.equal(recurrence.lastCompletion(data,data.tasks[0]),'2026-10-28');
});
test('legacy fixed-day missed rows are excluded but flexible snapshots survive task deletion',()=>{
 const tasks=[task('fixed',{anyDay:false}),task('flex')];
 assert.equal(recurrence.isFlexibleMissed({taskId:'fixed'},tasks),false);
 assert.equal(recurrence.isFlexibleMissed({taskId:'flex'},tasks),true);
 assert.equal(recurrence.isFlexibleMissed({taskId:'deleted',anyDay:true,recurrence:'weekly'},tasks),true);
});
test('weekly window uses Amsterdam time in winter and summer',async()=>{
 const {weeklyWindow}=await import('../supabase/functions/weekly-summary/handler.mjs');
 assert.equal(weeklyWindow(new Date('2026-11-02T07:59:00Z')),null);
 assert.equal(weeklyWindow(new Date('2026-11-02T08:00:00Z')).start,'2026-10-26');
 assert.ok(weeklyWindow(new Date('2026-07-06T07:00:00Z')));
 assert.equal(weeklyWindow(new Date('2026-11-01T22:59:00Z')),null);
});
test('generated dashboard registers a handler with its separate weekly secret',async()=>{
 const fs=require('fs'),vm=require('vm');let handler;
 const context=vm.createContext({Response,Intl,Date,fetch:()=>{throw Error('Unexpected network');},Deno:{env:{get:name=>name==='HOMEBOARD_WEEKLY_CRON_SECRET'?'weekly-secret':name==='SUPABASE_URL'?'https://db.invalid':'test'},serve:fn=>{handler=fn;}}});
 vm.runInContext('self=globalThis',context);
 vm.runInContext(fs.readFileSync('supabase/functions/weekly-summary/dashboard.ts','utf8'),context);
 assert.equal(typeof handler,'function');
 assert.equal((await handler(new Request('https://edge.invalid',{method:'POST'}))).status,401);
});
test('weekly delivery authenticates, isolates recipients, deduplicates and reports provider failure',async()=>{
 const {createWeeklySummaryHandler}=await import('../supabase/functions/weekly-summary/handler.mjs');
 const claims=new Set(),mails=[],statuses=[];let providerFails=false;
 const fetchImpl=async(url,o)=>{
  const body=JSON.parse(o.body);let data=[];
  if(url.includes('/rpc/weekly_summary_batch'))data=[{id:'home-a',data:{tasks:[task('Plants')]},recipients:[{id:'a',email:'a@example.invalid'}]},{id:'home-b',data:{tasks:[task('Dishes')]},recipients:[{id:'b',email:'b@example.invalid'}]}];
  else if(url.includes('api.brevo.com')){mails.push(body);return new Response('{}',{status:providerFails?503:201});}
  else if(o.method==='POST'){const key=JSON.stringify(body);if(!claims.has(key)){claims.add(key);data=[body];}}
  else{statuses.push(body.status);return new Response(null,{status:204});}
  return new Response(JSON.stringify(data));
 };
 const handler=createWeeklySummaryHandler({url:'https://db.invalid',serviceKey:'test',cronSecret:'test-secret',brevoKey:'test',fromEmail:'sender@example.invalid',recurrence,fetchImpl,now:()=>new Date('2026-11-02T08:00:00Z')});
 const request=()=>new Request('https://edge.invalid',{method:'POST',headers:{'x-homeboard-cron-secret':'test-secret'}});
 assert.equal((await handler(new Request('https://edge.invalid',{method:'POST'}))).status,401);
 assert.equal((await (await handler(request())).json()).accepted,2);
 assert.deepEqual(mails[0].to,[{email:'a@example.invalid'}]);assert.match(mails[0].textContent,/Plants/);assert.doesNotMatch(mails[0].textContent,/Dishes|https?:/);
 await handler(request());assert.equal(mails.length,2);
 claims.clear();providerFails=true;assert.equal((await (await handler(request())).json()).failed,2);
 assert.deepEqual(statuses,['accepted','accepted','failed','failed']);
});
