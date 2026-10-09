// The app is shipped directly to older iPads without transpilation. A newer
// syntax feature can prevent the whole script from parsing, including startup
// and all button bindings. A modern browser with an iPad user agent misses this.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

function checkSyntax(files) {
  // Node ships Acorn for its own parser tooling. Run in a separate process to
  // expose that bundled parser for tests without adding a browser dependency.
  execFileSync(process.execPath, ['--expose-internals', '-e', `
    const acorn = require('internal/deps/acorn/acorn/dist/acorn');
    const files = JSON.parse(require('node:fs').readFileSync(0, 'utf8'));
    for (const file of files) {
      try { acorn.parse(file.source, { ecmaVersion: 2018, sourceType: 'script' }); }
      catch (error) { throw new Error(file.name + ': ' + error.message); }
    }
  `], { input: JSON.stringify(files), encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
}

test('all shipped browser scripts parse using the older iPad syntax baseline', () => {
  const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const scripts = Array.from(index.matchAll(/<script\b[^>]*\bsrc="([^"?]+)[^"]*"/g), match => match[1]);
  assert.ok(scripts.includes('app.js') && scripts.includes('recurrence.js'));
  const files = [...scripts, 'sw.js'].map(name => ({ name, source: fs.readFileSync(path.join(root, name), 'utf8') }));
  checkSyntax(files);
});

test('the compatibility guard rejects the optional-chaining startup regression', () => {
  assert.throws(() => checkSyntax([{ name: 'incompatible.js', source: "const next = households[0]?.household_id || '';" }]), /incompatible\.js: Unexpected token/);
});
