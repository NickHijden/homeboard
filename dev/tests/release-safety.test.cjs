const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('staging uses a separate browser-storage namespace', () => {
  const app = read('app.js');
  assert.match(app, /const IS_STAGING_HOST = isStagingHost\(\);/);
  assert.match(app, /const STORAGE_NAMESPACE = .*IS_STAGING_HOST.*'-staging'.*IS_DEMO_HOST.*'-demo'/);
  assert.match(app, /const IDB_NAME = `homeboard-household-planner-storage\$\{STORAGE_NAMESPACE\}`;/);
  assert.match(app, /const SYNC_SESSION_KEY = `homeboard-sync-session-v1\$\{STORAGE_NAMESPACE\}`;/);
});

test('development hosts refuse the production Supabase project', () => {
  const app = read('app.js');
  assert.match(app, /const PRODUCTION_SUPABASE_URL = 'https:\/\/yflzmwriknvxhwhaetuk\.supabase\.co';/);
  assert.match(app, /if \(IS_DEVELOPMENT_HOST && isKnownProductionUrl\(url\)\)/);
});

test('public sites are centrally configured while only local development allows manual configuration', () => {
  const app = read('app.js');
  const index = read('index.html');
  assert.match(app, /const PRODUCTION_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_[A-Za-z0-9_-]+';/);
  assert.match(app, /if \(!IS_DEVELOPMENT_HOST\) return \{ url: CENTRAL_PRODUCTION_CONFIG\.url, key: CENTRAL_PRODUCTION_CONFIG\.key \};/);
  assert.match(index, /id="syncConfigFields" hidden/);
  assert.match(app, /if \(IS_STAGING_HOST\) return \{ url: CENTRAL_STAGING_CONFIG\.url, key: CENTRAL_STAGING_CONFIG\.key \};/);
  assert.match(app, /const MANUAL_SYNC_CONFIG_ALLOWED = IS_DEVELOPMENT_HOST && !IS_STAGING_HOST;/);
  assert.match(app, /els\.syncConfigFields\.hidden = !MANUAL_SYNC_CONFIG_ALLOWED/);
  assert.match(app, /const HOUSEHOLD_UI_ENABLED = IS_DEVELOPMENT_HOST \|\| Boolean/);
});

test('signed-in household members sync through the shared document', () => {
  const app = read('app.js');
  assert.match(app, /async function ensureSelectedHouseholdForSync\(\)/);
  assert.match(app, /household_documents\?household_id=eq\.\$\{householdId\}/);
  assert.match(app, /method: 'PATCH'/);
  assert.match(app, /return fetchLegacyRemoteData\(session\);/);
  assert.match(app, /Shared household synced just now/);
});

test('production and staging service workers keep separate caches', () => {
  const worker = read('sw.js');
  assert.match(worker, /const STAGING_PATH_PREFIX = '\/homeboard\/dev\/'/);
  assert.match(worker, /const CACHE_PREFIX = IS_STAGING \? 'homeboard-staging-shell-' : 'homeboard-shell-';/);
  assert.match(worker, /if \(!IS_STAGING && requestPath\.startsWith\(STAGING_PATH_PREFIX\)\) return;/);
  assert.match(worker, /key\.startsWith\(CACHE_PREFIX\)/);
});

test('release documentation keeps staging synthetic and production separate', () => {
  const development = read('DEVELOPMENT.md');
  const ignore = read('.gitignore');
  assert.match(development, /nickhijden\.github\.io\/homeboard\/dev/);
  assert.match(development, /synthetic data only/);
  assert.match(ignore, /\.env/);
  assert.match(ignore, /homeboard-backup-\*\.json/);
});

test('source tree contains no obvious private API credentials', () => {
  const candidates = ['app.js', 'index.html', 'README.md', 'DEVELOPMENT.md', 'sw.js'];
  const source = candidates.map(read).join('\n');
  assert.doesNotMatch(source, /sb_secret_[A-Za-z0-9_-]+/);
  assert.doesNotMatch(source, /xkeysib-[A-Za-z0-9_-]+/);
  assert.doesNotMatch(source, /service_role\s*[:=]/i);
});
