const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('staging uses a separate browser-storage namespace', () => {
  const app = read('app.js');
  assert.match(app, /const IS_STAGING_HOST = isStagingHost\(\);/);
  assert.match(app, /const STORAGE_NAMESPACE = IS_STAGING_HOST \? '-staging' : '';/);
  assert.match(app, /const IDB_NAME = `homeboard-household-planner-storage\$\{STORAGE_NAMESPACE\}`;/);
  assert.match(app, /const SYNC_SESSION_KEY = `homeboard-sync-session-v1\$\{STORAGE_NAMESPACE\}`;/);
});

test('development hosts refuse the production Supabase project', () => {
  const app = read('app.js');
  assert.match(app, /const PRODUCTION_SUPABASE_URL = 'https:\/\/yflzmwriknvxhwhaetuk\.supabase\.co';/);
  assert.match(app, /if \(IS_DEVELOPMENT_HOST && isKnownProductionUrl\(url\)\)/);
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
