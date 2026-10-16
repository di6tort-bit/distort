const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'apps/extension/manifest.json'), 'utf8'));
test('extension uses Manifest V3', () => assert.equal(manifest.manifest_version, 3));
test('preview does not request proxy or broad host access', () => {
  assert.deepEqual(manifest.permissions, ['storage']);
  assert.equal(manifest.host_permissions, undefined);
});
test('extension labels itself as not routing traffic', () => {
  const html = fs.readFileSync(path.join(root, 'apps/extension/popup.html'), 'utf8');
  assert.match(html, /does not change your traffic or IP address/i);
  assert.match(html, /Connection unavailable/i);
});
