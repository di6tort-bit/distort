const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

test('Electron renderer is isolated from Node.js', () => {
  const main = fs.readFileSync(path.join(root, 'apps/desktop/main.cjs'), 'utf8');
  assert.match(main, /contextIsolation:\s*true/);
  assert.match(main, /nodeIntegration:\s*false/);
  assert.match(main, /sandbox:\s*true/);
});

test('desktop preview does not claim an active VPN engine', () => {
  const preload = fs.readFileSync(path.join(root, 'apps/desktop/preload.cjs'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'apps/desktop/renderer/index.html'), 'utf8');
  assert.match(preload, /vpnEngine:\s*false/);
  assert.match(html, /Connect unavailable/);
  assert.match(html, /No traffic is being tunneled/);
});
