// Generate a single-file paste target for Supabase's dashboard editor.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const directory = path.join(root, 'tmp', 'account-deployment');
fs.mkdirSync(directory, { recursive: true });
const handler = fs.readFileSync(path.join(root, 'supabase/functions/delete-account/handler.mjs'), 'utf8');
const entrypoint = fs.readFileSync(path.join(root, 'supabase/functions/delete-account/index.ts'), 'utf8')
  .replace(/^import .*;\r?\n/, '');
fs.writeFileSync(path.join(directory, 'delete-account.ts'),
  '// Generated dashboard bundle. Development project axfxuqihsscjekicbgkk only.\n' + handler + '\n' + entrypoint);
console.log('Prepared tmp/account-deployment/delete-account.ts');
