import { createDeleteAccountHandler } from './handler.mjs';

Deno.serve(createDeleteAccountHandler({
  url: Deno.env.get('SUPABASE_URL'),
  publicKey: Deno.env.get('SUPABASE_ANON_KEY'),
  serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
  origins: (Deno.env.get('HOMEBOARD_ALLOWED_ORIGINS') || 'https://nickhijden.github.io')
    .split(',').map(value => value.trim()).filter(Boolean),
}));
