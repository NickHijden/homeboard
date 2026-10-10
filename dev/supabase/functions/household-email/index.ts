import { createHouseholdEmailHandler } from './handler.mjs';
Deno.serve(createHouseholdEmailHandler({
  url:Deno.env.get('SUPABASE_URL'), publicKey:Deno.env.get('SUPABASE_ANON_KEY'), serviceKey:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
  brevoKey:Deno.env.get('BREVO_API_KEY'), fromEmail:Deno.env.get('HOMEBOARD_FROM_EMAIL'),
  siteUrl:Deno.env.get('HOMEBOARD_SITE_URL'), operatorEmail:Deno.env.get('HOMEBOARD_OPERATOR_EMAIL'),
  origins:(Deno.env.get('HOMEBOARD_ALLOWED_ORIGINS')||'https://nickhijden.github.io').split(',').map(value=>value.trim()).filter(Boolean),
}));
