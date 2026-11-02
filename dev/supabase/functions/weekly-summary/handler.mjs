export function weeklyWindow(now) {
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Amsterdam',year:'numeric',month:'2-digit',day:'2-digit',weekday:'short',hour:'2-digit',hourCycle:'h23'}).formatToParts(now).map(p=>[p.type,p.value]));
 if(parts.weekday!=='Mon'||Number(parts.hour)<9)return null;
 const monday=new Date(parts.year+'-'+parts.month+'-'+parts.day+'T12:00:00Z');
 const start=new Date(monday);start.setUTCDate(start.getUTCDate()-7);
 const end=new Date(monday);end.setUTCDate(end.getUTCDate()-1);
 return {boundary:monday,start:start.toISOString().slice(0,10),end:end.toISOString().slice(0,10)};
}
export function createWeeklySummaryHandler({url,serviceKey,cronSecret,brevoKey,fromEmail,recurrence,fetchImpl=fetch,now=()=>new Date()}) {
 return async request=>{
  const reply=(status,data)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
  if(request.method!=='POST')return reply(405,{error:'Use POST'});
  if(!cronSecret||request.headers.get('x-homeboard-cron-secret')!==cronSecret)return reply(401,{error:'Unauthorized'});
  if(!url||!serviceKey||!brevoKey||!fromEmail)return reply(503,{error:'Weekly email is not configured'});
  const window=weeklyWindow(now());if(!window)return reply(200,{skipped:true,reason:'Outside Monday delivery window'});
  const call=async(path,method='POST',body,prefer)=>{
   const r=await fetchImpl(url+'/rest/v1/'+path,{method,headers:{apikey:serviceKey,Authorization:'Bearer '+serviceKey,'Content-Type':'application/json',...(prefer?{Prefer:prefer}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
   if(!r.ok)throw Error('Weekly summary database request failed');
   return r.status===204?null:await r.json();
  };
  let accepted=0,failed=0,after=null;
  const clean=s=>String(s||'Household task').replace(/(?:https?:\/\/|www\.)\S+/gi,'[address omitted]').replace(/[\r\n]/g,' ').slice(0,160);
  try {
   while(true){
    const households=await call('rpc/weekly_summary_batch','POST',{after_id:after});
    if(!households.length)break;
    for(const household of households){
     const rows=recurrence.missedHistory(household.data,window.boundary).filter(row=>row.weekStart===window.start && recurrence.isFlexibleMissed(row,household.data.tasks));
     // Always send an overview, including when no tasks were missed.
     const text='Homeboard weekly overview\n\nWeek: '+window.start+' to '+window.end+'\n\n'+
       (rows.length?'Recurring tasks without a fixed day recorded as missed:\n'+rows.map(row=>'• '+clean(row.title)).join('\n'):'No missed recurring tasks without a fixed day were found in the synced board for this week.')+
       '\n\nBased on the latest synced board. Tasks may have been completed since their missed week. Offline changes are included only after syncing. Open your Homeboard app to review them.';
     for(const recipient of household.recipients){
      const identity={household_id:household.id,user_id:recipient.id,week_start:window.start};
      const claim=await call('homeboard_weekly_deliveries?on_conflict=household_id,user_id,week_start','POST',identity,'resolution=ignore-duplicates,return=representation');
      if(!claim.length)continue;
      let status='unknown';
      try {
       const r=await fetchImpl('https://api.brevo.com/v3/smtp/email',{method:'POST',headers:{'api-key':brevoKey,'Content-Type':'application/json'},body:JSON.stringify({sender:{email:fromEmail,name:'Homeboard'},to:[{email:recipient.email}],subject:'Homeboard — weekly task overview',textContent:text})});
       status=r.ok?'accepted':'failed';if(r.ok)accepted++;else failed++;
      } catch(e){failed++;}
      await call('homeboard_weekly_deliveries?household_id=eq.'+encodeURIComponent(household.id)+'&user_id=eq.'+encodeURIComponent(recipient.id)+'&week_start=eq.'+window.start,'PATCH',{status},'return=minimal');
     }
    }
    after=households[households.length-1].id;
    if(households.length<25)break;
   }
   return reply(200,{accepted,failed,weekStart:window.start});
  }catch(e){return reply(500,{error:'Weekly summary could not finish',accepted,failed});}
 };
}
