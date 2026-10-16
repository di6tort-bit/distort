#!/usr/bin/env node
'use strict';

const net = require('node:net');
const https = require('node:https');

const DEFAULT_SOURCE = 'https://raw.githubusercontent.com/miladtahanian/Config-Collector/main/mixed_iran.txt';
const DEFAULT_TIMEOUT_MS = 2500;
const DEFAULT_CONCURRENCY = 20;

function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(normalized, 'base64').toString('utf8');
}

function parseEndpoint(line) {
  const raw = String(line || '').trim();
  if (!raw || raw.startsWith('#')) return null;

  try {
    if (raw.startsWith('vmess://')) {
      const payload = decodeBase64Url(raw.slice('vmess://'.length));
      const data = JSON.parse(payload);
      const host = String(data.add || '').trim();
      const port = Number(data.port);
      if (!host || !Number.isInteger(port) || port < 1 || port > 65535) return null;
      return { scheme: 'vmess', host, port, transport: String(data.net || 'tcp'), raw };
    }

    const url = new URL(raw);
    const scheme = url.protocol.slice(0, -1).toLowerCase();
    if (!['vless', 'trojan', 'ss'].includes(scheme)) return null;

    // Shadowsocks links may encode their endpoint in the user-info segment.
    if (scheme === 'ss') {
      const afterAt = raw.slice(raw.lastIndexOf('@') + 1);
      const endpoint = afterAt.split(/[/?#]/, 1)[0];
      const match = endpoint.match(/^\[([^\]]+)\]:(\d+)$/) || endpoint.match(/^([^:]+):(\d+)$/);
      if (!match) return null;
      const host = match[1];
      const port = Number(match[2]);
      if (!host || !Number.isInteger(port) || port < 1 || port > 65535) return null;
      return { scheme, host, port, transport: 'tcp', raw };
    }

    const host = url.hostname;
    const port = Number(url.port);
    if (!host || !Number.isInteger(port) || port < 1 || port > 65535) return null;
    const transport = (url.searchParams.get('type') || url.searchParams.get('network') || 'tcp').toLowerCase();
    return { scheme, host, port, transport, raw };
  } catch {
    return null;
  }
}

function deduplicateConfigs(lines) {
  const seen = new Set();
  const result = [];
  for (const line of lines) {
    const raw = String(line || '').trim();
    if (!raw || raw.startsWith('#') || seen.has(raw)) continue;
    seen.add(raw);
    result.push(raw);
  }
  return result;
}

function checkTcpReachability(endpoint, timeoutMs = DEFAULT_TIMEOUT_MS) {
  return new Promise((resolve) => {
    const started = Date.now();
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve({ ...result, latencyMs: Date.now() - started });
    };

    const socket = net.createConnection({ host: endpoint.host, port: endpoint.port });
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => {
      finish({ reachable: true, reason: 'tcp-connect' });
      socket.destroy();
    });
    socket.once('timeout', () => {
      finish({ reachable: false, reason: 'timeout' });
      socket.destroy();
    });
    socket.once('error', (error) => {
      finish({ reachable: false, reason: error.code || 'connection-error' });
    });
  });
}

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { timeout: 10000, headers: { 'user-agent': 'DISTORT-config-preflight/0.1' } }, (response) => {
      if (response.statusCode < 200 || response.statusCode >= 300) {
        response.resume();
        reject(new Error('Source returned HTTP ' + response.statusCode));
        return;
      }
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => resolve(body));
    }).on('timeout', function () {
      this.destroy(new Error('Source request timed out'));
    }).on('error', reject);
  });
}

async function mapLimit(items, limit, worker) {
  const output = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      output[index] = await worker(items[index], index);
    }
  });
  await Promise.all(workers);
  return output;
}

async function scanConfigs(lines, options = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  const unique = deduplicateConfigs(lines);
  const parsed = unique.map((raw) => ({ raw, endpoint: parseEndpoint(raw) }));
  const supported = parsed.filter((item) => item.endpoint);
  const results = await mapLimit(supported, concurrency, async (item) => {
    const endpoint = item.endpoint;
    // TCP reachability is not proof that the VPN handshake or tunneled traffic works.
    if (['hysteria', 'hysteria2', 'tuic'].includes(endpoint.scheme) ||
        ['udp', 'quic'].includes(endpoint.transport)) {
      return { raw: item.raw, scheme: endpoint.scheme, host: endpoint.host, port: endpoint.port,
        reachable: null, reason: 'udp-needs-protocol-engine', latencyMs: null };
    }
    const check = await checkTcpReachability(endpoint, timeoutMs);
    return { raw: item.raw, scheme: endpoint.scheme, host: endpoint.host, port: endpoint.port, ...check };
  });
  results.sort((a, b) => {
    if (a.reachable === true && b.reachable !== true) return -1;
    if (b.reachable === true && a.reachable !== true) return 1;
    return (a.latencyMs ?? Number.MAX_SAFE_INTEGER) - (b.latencyMs ?? Number.MAX_SAFE_INTEGER);
  });
  return {
    sourceCount: (lines || []).length,
    uniqueCount: unique.length,
    parsedCount: supported.length,
    reachableCount: results.filter((item) => item.reachable === true).length,
    results
  };
}

async function main() {
  const source = process.argv[2] || DEFAULT_SOURCE;
  const outputPath = process.argv[3] || 'distort-reachable-configs.txt';
  const sourceText = await fetchText(source);
  const report = await scanConfigs(sourceText.split(/\r?\n/));
  const reachable = report.results.filter((item) => item.reachable === true);
  const fs = require('node:fs');
  fs.writeFileSync(outputPath, reachable.map((item) => item.raw).join('\n') + (reachable.length ? '\n' : ''), { mode: 0o600 });
  fs.writeFileSync(outputPath + '.report.json', JSON.stringify({
    ...report,
    results: report.results.map(({ raw, ...safe }) => safe)
  }, null, 2) + '\n', { mode: 0o600 });
  console.log('DISTORT config preflight');
  console.log('Source entries: ' + report.sourceCount);
  console.log('Unique entries: ' + report.uniqueCount);
  console.log('Recognized entries: ' + report.parsedCount);
  console.log('TCP-reachable endpoints: ' + report.reachableCount);
  console.log('Saved reachable candidates to ' + outputPath);
  console.log('Important: TCP reachability is only a preliminary filter, not proof that a VPN tunnel works.');
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Config scan failed: ' + error.message);
    process.exitCode = 1;
  });
}

module.exports = { parseEndpoint, deduplicateConfigs, checkTcpReachability, scanConfigs };
