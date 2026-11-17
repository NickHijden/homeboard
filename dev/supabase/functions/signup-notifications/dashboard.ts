// Private scheduled worker. Recipient is fixed by the operator's request.
function createSignupNotificationHandler({url,serviceKey,cronSecret,brevoKey,fromEmail,fetchImpl=fetch}) {
 const projects={'https://yflzmwriknvxhwhaetuk.supabase.co':'Production','https://axfxuqihsscjekicbgkk.supabase.co':'Development'};
 const base=String(url||'').replace(/\/$/,'');
 const environment=projects[base];
 return async request=>{
  const reply=(status,body)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
  if(request.method!=='POST')return reply(405,{error:'Use POST'});
  if(!cronSecret||request.headers.get('x-homeboard-cron-secret')!==cronSecret)return reply(401,{error:'Unauthorized'});
  if(!environment||!serviceKey||!brevoKey||!fromEmail)return reply(503,{error:'Signup notification is not configured'});
  const call=async(path,method,body)=>{
   const result=await fetchImpl(base+'/rest/v1/'+path,{method,signal:AbortSignal.timeout(10000),headers:{apikey:serviceKey,Authorization:'Bearer '+serviceKey,'Content-Type':'application/json',...(method==='PATCH'?{Prefer:'return=minimal'}:{})},body:JSON.stringify(body)});
   if(!result.ok)throw Error('Database request failed');
   return result.status===204?null:await result.json();
  };
  let accepted=0,failed=0;
  const started=Date.now();
  try {
   // Claim one at a time, so a worker interruption cannot reserve a whole batch.
   for(let count=0;count<25&&Date.now()-started<45000;count++){
    const account=await call('rpc/claim_homeboard_signup_notification','POST',{});
    if(!account)break;
    const email=String(account.email||'').replace(/[\r\n]/g,' ').slice(0,254);
    const created=new Date(account.created_at);
    const time=Number.isNaN(created.getTime())?'Onbekend':new Intl.DateTimeFormat('nl-NL',{timeZone:'Europe/Amsterdam',dateStyle:'long',timeStyle:'short'}).format(created);
    let status='unknown',providerStatus=null;
    try {
     const response=await fetchImpl('https://api.brevo.com/v3/smtp/email',{method:'POST',signal:AbortSignal.timeout(10000),headers:{'api-key':brevoKey,'Content-Type':'application/json'},body:JSON.stringify({
      sender:{email:fromEmail,name:'Homeboard'},to:[{email:'nickyjim@live.nl'}],
      subject:'Homeboard ['+environment+'] - nieuw account',
      textContent:'Er is een nieuw Homeboard-account aangemaakt.\n\nOmgeving: '+environment+'\nE-mailadres: '+email+'\nAangemaakt: '+time+' (Europe/Amsterdam)\nE-mail bevestigd: '+(account.confirmed?'Ja':'Nog niet')+'\n\nDit is een melding van accountaanmaak. Het account kan nog wachten op e-mailbevestiging of het aanmaken van een huishouden.'
     })});
     providerStatus=response.status;status=response.ok?'accepted':'failed';
    }catch{status='unknown';}
    if(status==='accepted')accepted++;else failed++;
    await call('homeboard_signup_notifications?user_id=eq.'+encodeURIComponent(account.id),'PATCH',{status,provider_status:providerStatus});
   }
   return reply(200,{environment,accepted,failed});
  }catch{return reply(500,{error:'Signup notification could not finish',accepted,failed});}
 };
}

Deno.serve(createSignupNotificationHandler({url:Deno.env.get('SUPABASE_URL'),serviceKey:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),cronSecret:Deno.env.get('HOMEBOARD_WEEKLY_CRON_SECRET'),brevoKey:Deno.env.get('BREVO_API_KEY'),fromEmail:Deno.env.get('HOMEBOARD_FROM_EMAIL')}));
