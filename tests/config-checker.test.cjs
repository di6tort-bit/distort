'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseEndpoint, deduplicateConfigs, scanConfigs } = require('../tools/config-checker.cjs');

test('parses a VLESS endpoint and transport', () => {
  const endpoint = parseEndpoint('vless://uuid@example.com:443?type=ws&security=tls#test');
  assert.equal(endpoint.scheme, 'vless');
  assert.equal(endpoint.host, 'example.com');
  assert.equal(endpoint.port, 443);
  assert.equal(endpoint.transport, 'ws');
});

test('parses a VMess JSON payload', () => {
  const payload = Buffer.from(JSON.stringify({ add: 'vmess.example', port: '8443', net: 'ws' })).toString('base64');
  const endpoint = parseEndpoint('vmess://' + payload);
  assert.equal(endpoint.host, 'vmess.example');
  assert.equal(endpoint.port, 8443);
  assert.equal(endpoint.transport, 'ws');
});

test('rejects malformed links and comments', () => {
  assert.equal(parseEndpoint('# comment'), null);
  assert.equal(parseEndpoint('not-a-config'), null);
  assert.equal(parseEndpoint('vless://uuid@example.com:99999?type=tcp'), null);
});

test('deduplicates identical lines and ignores comments/blank lines', () => {
  assert.deepEqual(deduplicateConfigs(['', '# hi', 'vless://a@b.com:443?type=tcp', 'vless://a@b.com:443?type=tcp']), [
    'vless://a@b.com:443?type=tcp'
  ]);
});

test('reports malformed entries without attempting network access', async () => {
  const report = await scanConfigs(['# comment', 'bad-link', 'vless://id@example.com:443?type=tcp'], {
    concurrency: 1,
    timeoutMs: 20
  });
  assert.equal(report.uniqueCount, 2);
  assert.equal(report.parsedCount, 1);
  assert.equal(report.results.length, 1);
});
