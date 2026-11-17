const fs=require('fs');const path=require('path');const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'supabase/functions/signup-notifications/handler.mjs'),'utf8').replace('export function ','function ');
fs.writeFileSync(path.join(root,'supabase/functions/signup-notifications/dashboard.ts'),source+"\nDeno.serve(createSignupNotificationHandler({url:Deno.env.get('SUPABASE_URL'),serviceKey:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),cronSecret:Deno.env.get('HOMEBOARD_WEEKLY_CRON_SECRET'),brevoKey:Deno.env.get('BREVO_API_KEY'),fromEmail:Deno.env.get('HOMEBOARD_FROM_EMAIL')}));\n");
for(const [name,id] of [['production','yflzmwriknvxhwhaetuk'],['development','axfxuqihsscjekicbgkk']]){
 const sql=fs.readFileSync(path.join(root,'supabase/weekly-summary-schedule-'+name+'.sql'),'utf8')
  .replace(/--[^\n]*\n/g,'')
  .replaceAll('homeboard-weekly-summary','homeboard-signup-notifications')
  .replaceAll('/functions/v1/weekly-summary','/functions/v1/signup-notifications')
  .replaceAll('*/15 * * * 1','*/5 * * * *');
 fs.writeFileSync(path.join(root,'supabase/signup-notifications-schedule-'+name+'.sql'),
  '-- '+name.toUpperCase()+': '+id+'\n-- Deploy signup-notifications first; Verify JWT OFF, handler secret stays required.\n-- Uses the existing HOMEBOARD_WEEKLY_CRON_SECRET and matching Vault secret.\n'+sql);
}

for(const name of ['production','development']){
 const setup=fs.readFileSync(path.join(root,'supabase/signup-notifications-setup.sql'),'utf8');
 const schedule=fs.readFileSync(path.join(root,'supabase/signup-notifications-schedule-'+name+'.sql'),'utf8');
 fs.writeFileSync(path.join(root,'supabase/signup-notifications-install-'+name+'.sql'),setup+'\n'+schedule);
}
