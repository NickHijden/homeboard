const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const plainText = (text) => text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

test('published privacy sections preserve every paragraph of the supplied draft', () => {
  const draft = read('PRIVACY-TERMS-DRAFT.md');
  const page = read('privacy.html');
  for (const [heading, id] of [
    ['Acceptable use acknowledgement', 'acceptable-use'],
    ['Terms of Use', 'terms-of-use'],
    ['Privacy Notice', 'privacy-notice'],
  ]) {
    const markdown = draft.split(`## ${heading}\n`)[1].split('\n## ')[0].trim();
    const html = page.split(`id="${id}"`)[1].split('</section>')[0];
    for (const paragraph of markdown.split(/\n\s*\n/)) {
      assert.ok(plainText(html).includes(plainText(paragraph)), `Missing ${heading} paragraph: ${paragraph}`);
    }
  }
  const acknowledgement = draft.split('## Signup acknowledgement\n')[1].split('\n## ')[0]
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  const label = read('index.html').match(/<label id="signupAcknowledgementText"[^>]*>([\s\S]*?)<\/label>/)[1];
  assert.equal(plainText(label), plainText(acknowledgement));
});

test('signup records the version displayed in the documents', () => {
  const version = read('app.js').match(/const PRIVACY_TERMS_VERSION = '([^']+)'/)[1];
  assert.ok(read('privacy.html').includes(`data-privacy-version="${version}"`));
  assert.ok(read('privacy.html').includes(`<strong>${version}</strong>`));
});

test('the offline shell includes privacy documents with matching release assets', () => {
  const version = read('app.js').match(/const APP_VERSION = '([^']+)'/)[1];
  const worker = read('sw.js');
  assert.ok(worker.includes(`const APP_VERSION = '${version}'`));
  assert.ok(worker.includes("'./privacy.html'"));
  for (const file of ['index.html', 'privacy.html']) {
    for (const [, assetVersion] of read(file).matchAll(/(?:css|js)\?v=([^"\s]+)/g)) {
      assert.equal(assetVersion, version, file);
    }
  }
});
