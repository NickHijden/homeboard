// Server-only delivery. Caller identity and recipients are resolved from Auth
// and household membership, never from a browser-supplied list of addresses.
export function createHouseholdEmailHandler({url,publicKey,serviceKey,brevoKey,fromEmail,siteUrl,origins=[],operatorEmail,fetchImpl=fetch}) {
  const escape = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  return async function handle(request) {
    const origin=request.headers.get('origin');
    const headers={'Content-Type':'application/json','Cache-Control':'no-store',Vary:'Origin'};
    if(origin && origins.includes(origin)) Object.assign(headers,{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info'});
    const reply=(status,body)=>new Response(JSON.stringify(body),{status,headers});
    if(origin && !origins.includes(origin))return reply(403,{message:'This site is not allowed.'});
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
    if(request.method!=='POST')return reply(405,{message:'Use POST.'});
    const bearer=request.headers.get('authorization');
    if(!bearer || !/^Bearer \S+$/i.test(bearer))return reply(401,{message:'Sign in first.'});
    if(!url||!publicKey||!serviceKey||!brevoKey||!fromEmail||!siteUrl)return reply(503,{message:'Email delivery is not configured yet.'});
    let parsedSite;try{parsedSite=new URL(siteUrl);if(parsedSite.protocol!=='https:')throw Error();}catch{return reply(503,{message:'The public Homeboard address is not configured.'});}
    const call=async(path,body,token=bearer,key=publicKey,method='POST')=>{
      const response=await fetchImpl(url+path,{method,headers:{apikey:key,Authorization:token,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
      const data=await response.json().catch(()=>null);
      if(!response.ok)throw Object.assign(new Error(data?.message||'The household request was rejected.'),{status:response.status});return data;
    };
    let operation, invitation, sent=0;
    const recordStatus=async status=>{
      if(!operation?.request_id)return;
      await fetchImpl(url+'/rest/v1/homeboard_email_requests?id=eq.'+encodeURIComponent(operation.request_id),{method:'PATCH',headers:{apikey:serviceKey,Authorization:'Bearer '+serviceKey,'Content-Type':'application/json'},body:JSON.stringify({status})}).catch(()=>{});
    };
    try{
      const reader=request.body?.getReader();if(!reader)return reply(400,{message:'A request is required.'});
      let length=0;const chunks=[];
      while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>8192){await reader.cancel();return reply(413,{message:'Request too large.'});}chunks.push(value);}
      const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
      let body;try{body=JSON.parse(new TextDecoder().decode(bytes));}catch{return reply(400,{message:'Invalid request.'});}
      const actions=['invite','renew','notify','claim-pass','approve-pass','request-renewal'];
      if(!body||!actions.includes(body.action)||typeof body.household_id!=='string'||body.recipients||body.to||body.site_url)return reply(400,{message:'Invalid household request.'});
      const user=await call('/auth/v1/user',undefined,bearer,publicKey,'GET');
      if(!user?.id||!user.email_confirmed_at)return reply(401,{message:'Sign in with a confirmed email.'});
      operation=await call('/rest/v1/rpc/prepare_household_email',{target_household_id:body.household_id,email_operation:body.action,request_key:body.request_id||crypto.randomUUID()});
      if(operation.duplicate)return reply(200,{message:'This request has already been submitted.',duplicate:true});
      let recipients=[],subject='',text='';
      const link=new URL(parsedSite);link.hash='';link.search='';
      if(body.action==='invite'||body.action==='renew'){
        if(body.action==='invite')invitation=await call('/rest/v1/rpc/create_email_invitation',{target_household_id:body.household_id,target_email:body.email});
        else invitation=await call('/rest/v1/rpc/renew_email_invitation',{target_household_id:body.household_id,target_invitation_id:body.invitation_id});
        link.searchParams.set('invite',invitation.token); recipients=[invitation.invited_email];subject='You are invited to a Homeboard household';
        text=`You have been invited to share a Homeboard household.\n\nOpen ${link.toString()}\n\nOr sign in to Homeboard and enter this invitation code: ${invitation.code}\n\nUse this email address to sign in or create your account. Confirm your email before joining. This invitation expires in seven days and works once. If you were not expecting it, you can ignore this message.`;
      }else if(body.action==='claim-pass'||body.action==='approve-pass'){
        const pass=await call('/rest/v1/rpc/'+(body.action==='claim-pass'?'claim_free_household_pass':'approve_household_pass'),{target_household_id:body.household_id});
        link.searchParams.set('activate',pass.code);link.searchParams.set('household',body.household_id);recipients=[pass.email];subject='Your Homeboard access pass';
        text=`Your ${pass.duration_months}-month household pass is ready.\n\nOpen ${link.toString()}\n\nOr enter this activation code in Settings → Household access: ${pass.code}\n\nThe pass starts when activated. Early renewal adds time to your current expiry date. This code can be used once within 30 days.`;
      }else if(body.action==='request-renewal'){
        if(!operatorEmail)return reply(503,{message:'Renewal requests are not configured yet.'});
        recipients=[operatorEmail];subject='Homeboard household renewal request';text=`A household owner has requested renewal.\nHousehold ID: ${body.household_id}\n\nReview the request in Homeboard administration. Sending this request does not extend access.`;
      }else{
        recipients=operation.recipients||[];subject='Your Homeboard household has an update';
        text=`A household member ${body.change==='updated'?'updated an entry':'added an entry'} on your shared board.\n\nOpen ${link.toString()} to view it.\n\nPlanner details are not included in this email.`;
      }
      for(const recipient of recipients){
        const response=await fetchImpl('https://api.brevo.com/v3/smtp/email',{method:'POST',headers:{'api-key':brevoKey,'Content-Type':'application/json'},body:JSON.stringify({sender:{email:fromEmail,name:'Homeboard'},to:[{email:recipient}],subject,textContent:text,htmlContent:'<div style="font-family:Arial,sans-serif;line-height:1.6">'+escape(text).replace(/\n/g,'<br>')+'</div>',headers:{'Idempotency-Key':operation.request_id+':'+sent}})});
        if(!response.ok)throw Object.assign(new Error('The email provider did not accept this message.'),{delivery:true});sent++;
      }
      await recordStatus('sent');
      return reply(200,{message:sent?'Email accepted for delivery. Please check the recipient’s inbox and spam folder.':'Saved. There are no other verified members to notify.',sent,...(invitation?{invitation}:{} )});
    }catch(error){
      await recordStatus(error.status?'failed':'unknown');
      // A generated invitation is still usable if delivery fails; return it to
      // its authorized owner for manual sharing. Never claim it was emailed.
      if(invitation)return reply(200,{message:'Invitation ready, but email delivery could not be confirmed. Copy and send its link.',sent,invitation});
      return reply(error.status===401?401:error.status===403?403:error.status?400:502,{message:error.delivery?'Email delivery could not be confirmed. Please try again later.':error.status?error.message:'The email request could not be completed.'});
    }
  };
}
