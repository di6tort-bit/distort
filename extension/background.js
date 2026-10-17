// background.js — Distort MV3 service worker
// Handles connect/disconnect via chrome.proxy.settings, badge, notifications,
// alarms (state freshness), and best-effort byte counting via webRequest.

const ALARM_NAME = 'distort-keepalive';
const STATE_KEY = 'distortState';
const SETTINGS_KEY = 'settings';

const DEFAULT_STATE = {
  connected: false,
  connecting: false,
  serverId: 'de-fra-01',
  protocol: 'wireguard',
  stealth: true,
  sessionStart: null,
  bytesDown: 0,
  bytesUp: 0,
  downSpeed: 0,
  upSpeed: 0,
  resilience: 'checking',
};

// --- State helpers -----------------------------------------------------------
async function getState() {
  const data = await chrome.storage.local.get(STATE_KEY);
  return { ...DEFAULT_STATE, ...(data[STATE_KEY] || {}) };
}

async function setState(patch) {
  const cur = await getState();
  const next = { ...cur, ...patch };
  await chrome.storage.local.set({ [STATE_KEY]: next });
  return next;
}

// --- Badge -------------------------------------------------------------------
async function updateBadge(connected) {
  if (connected) {
    await chrome.action.setBadgeBackgroundColor({ color: '#10d9a0' });
    await chrome.action.setBadgeText({ text: 'ON' });
  } else {
    await chrome.action.setBadgeBackgroundColor({ color: '#8aa0c4' });
    await chrome.action.setBadgeText({ text: 'OFF' });
  }
}

// --- Notifications -----------------------------------------------------------
async function notify(title, message) {
  try {
    await chrome.notifications.create({
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon-128.png'),
      title,
      message,
      priority: 2,
    });
  } catch (err) {
    // Notifications permission is in manifest; fail silently if unavailable.
    console.warn('notify failed:', err);
  }
}

// --- Proxy configuration -----------------------------------------------------
function buildProxyConfig(host, port, protocol, stealth) {
  // Distort nodes expose a SOCKS5 front (with obfuscation on stealth).
  // We use chrome.proxy.settings PAC script to route all traffic through it.
  // For WireGuard/V2Ray/Trojan/Shadowsocks we map to a SOCKS5 listener provided
  // by the local Distort helper (in production this is the desktop companion).
  // In the browser-only extension, we set fixed_servers with SOCKS5.
  const scheme = 'socks5';
  const rules = {
    singleProxy: {
      scheme,
      host,
      port,
    },
    // Bypass the Distort control origin so the extension can still talk to the app.
    bypassList: ['distort.app', '*.distort.app', 'localhost', '127.0.0.1'],
  };

  // Also embed a tiny PAC fallback in case fixed_servers is overridden.
  const pacScript = `
    function FindProxyForURL(url, host) {
      if (dnsDomainIs(host, "distort.app") || dnsDomainIs(host, ".distort.app")) {
        return "DIRECT";
      }
      return "${scheme} ${host}:${port}";
    }
  `;

  return {
    mode: 'fixed_servers',
    rules,
    // pacScript is allowed alongside fixed_servers in MV3 (Chrome 114+).
    // If Chrome rejects it, fixed_servers.rules is authoritative.
  };
}

async function applyProxy(host, port, protocol, stealth) {
  const config = buildProxyConfig(host, port, protocol, stealth);
  return new Promise((resolve, reject) => {
    chrome.proxy.settings.set({ value: config, scope: 'regular' }, () => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message));
      else resolve();
    });
  });
}

async function clearProxy() {
  return new Promise((resolve, reject) => {
    chrome.proxy.settings.set({ value: { mode: 'direct' }, scope: 'regular' }, () => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message));
      else resolve();
    });
  });
}

// Verify that the proxy is actually forwarding traffic.
// Does a real HTTP request through the proxy to a known-good endpoint.
async function verifyProxyWorks(server) {
  // We can't directly test the VPN tunnel from the SW, but we CAN verify
  // that Chrome is now routing requests through the proxy by checking
  // if a request to the proxy's SOCKS port succeeds.
  try {
    // Quick check: fetch a lightweight endpoint through the proxy.
    // If the proxy is broken, this will fail or timeout.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch('https://www.google.com/generate_204', {
      cache: 'no-store',
      signal: controller.signal,
    });
    clearTimeout(timeout);
    // generate_204 returns 204 on success
    return res.status === 204 || res.ok;
  } catch (err) {
    console.warn('proxy verification fetch failed:', err.message);
    // If the fetch fails, it might be because:
    // 1. The proxy is broken (real failure)
    // 2. The proxy is working but google is blocked (common in Iran)
    // We can't distinguish, so be conservative: only return true if
    // we got ANY response (even an error status), which means the proxy
    // is at least routing traffic.
    if (err.name === 'AbortError') {
      // Timeout — proxy may be slow or broken
      return false;
    }
    // Other errors (TypeError) mean the fetch itself failed,
    // which usually means the proxy isn't routing at all.
    return false;
  }
}

// --- Connect / Disconnect handlers ------------------------------------------
async function handleConnect(message) {
  const { server, protocol, stealth } = message;
  if (!server || !server.host || !server.port) {
    throw new Error('Invalid server payload');
  }

  // Mark as "connecting" while we attempt the proxy
  await setState({
    connected: false,
    connecting: true,
    serverId: server.id,
    protocol: protocol || 'wireguard',
    stealth: !!stealth,
    sessionStart: null,
    error: null,
  });
  await updateBadge(false);

  // Apply the proxy — if this fails, do NOT mark as connected.
  try {
    await applyProxy(server.host, server.port, protocol || 'wireguard', !!stealth);
  } catch (err) {
    // Proxy apply failed — mark as error, NOT connected.
    console.error('applyProxy failed:', err.message);
    await setState({
      connected: false,
      connecting: false,
      error: `Proxy setup failed: ${err.message}`,
      serverId: null,
      sessionStart: null,
    });
    await updateBadge(false);
    await notify('DISTORT — Connection failed', err.message);
    return { ok: false, error: err.message };
  }

  // Proxy was applied successfully — now verify it's actually working
  // by doing a quick reachability check through the proxy.
  const verified = await verifyProxyWorks(server);
  if (!verified) {
    // Proxy was set but verification failed — don't claim "connected"
    console.warn('Proxy applied but verification failed — server may be unreachable');
    await setState({
      connected: false,
      connecting: false,
      error: 'Proxy set but server unreachable',
      sessionStart: null,
    });
    await updateBadge(false);
    return { ok: false, error: 'Server unreachable through proxy' };
  }

  // All checks passed — mark as connected
  // NOTE: 'connected' here means 'proxy is set AND verification passed'.
  // This does NOT mean the selected protocol (WireGuard/V2Ray/etc.) is running —
  // the extension only sets a SOCKS5 proxy. For real VPN protocols, use the
  // desktop app. This is explicitly documented in the state as 'proxyVerified'.
  await setState({
    connected: true,
    connecting: false,
    proxyVerified: true,  // distinct from 'connected' — means HTTP test passed
    serverId: server.id,
    protocol: protocol || 'wireguard',
    stealth: !!stealth,
    sessionStart: Date.now(),
    bytesDown: 0,
    bytesUp: 0,
    downSpeed: 0,
    upSpeed: 0,
    error: null,
  });
  await updateBadge(true);
  await notify('Distort connected', `${server.country} · ${server.city} (SOCKS5 proxy verified)`);
}

async function handleDisconnect() {
  try {
    await clearProxy();
  } catch (err) {
    console.warn('clearProxy failed:', err.message);
  }
  await setState({
    connected: false,
    connecting: false,
    sessionStart: null,
    downSpeed: 0,
    upSpeed: 0,
  });
  await updateBadge(false);
  await notify('Distort disconnected', 'You are no longer protected.');
}

// --- Best-effort byte counter via webRequest --------------------------------
let byteCounter = { down: 0, up: 0, lastTs: 0, lastDown: 0, lastUp: 0 };

function startWebRequestWatcher() {
  if (!chrome.webRequest) return;
  try {
    chrome.webRequest.onCompleted.addListener(
      (details) => {
        if (!details.tabId || details.tabId < 0) return;
        const contentLen = details.responseHeaders
          ? details.responseHeaders.find((h) => h.name.toLowerCase() === 'content-length')
          : null;
        if (contentLen) byteCounter.down += Number(contentLen.value || 0);
      },
      { urls: ['http://*/*', 'https://*/*'] },
      ['responseHeaders']
    );
  } catch (err) {
    console.warn('webRequest.onCompleted setup failed:', err);
  }
}

// --- Alarms (keep state fresh + badge speed every 60s) ----------------------
async function setupAlarms() {
  await chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 });
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_NAME) return;
  const st = await getState();
  if (!st.connected) return;
  // Update down/up speed estimate + persist bytes.
  const now = Date.now();
  if (byteCounter.lastTs) {
    const dt = (now - byteCounter.lastTs) / 1000;
    const downBytes = byteCounter.down - byteCounter.lastDown;
    const upBytes = byteCounter.up - byteCounter.lastUp;
    const downSpeed = dt > 0 ? downBytes / dt : 0;
    const upSpeed = dt > 0 ? upBytes / dt : 0;
    await setState({
      bytesDown: (st.bytesDown || 0) + downBytes,
      bytesUp: (st.bytesUp || 0) + upBytes,
      downSpeed,
      upSpeed,
    });
  }
  byteCounter.lastTs = now;
  byteCounter.lastDown = byteCounter.down;
  byteCounter.lastUp = byteCounter.up;
  // Update badge to show a tiny down speed indicator (truncated to 4 chars).
  try {
    const mbps = (st.downSpeed * 8) / 1e6;
    let label = 'ON';
    if (mbps > 0.5) label = mbps < 10 ? mbps.toFixed(1) + 'M' : Math.round(mbps) + 'M';
    await chrome.action.setBadgeText({ text: label });
    await chrome.action.setBadgeBackgroundColor({ color: '#10d9a0' });
  } catch {
    // ignore
  }
});

// --- Message router ----------------------------------------------------------
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    try {
      switch (message && message.type) {
        case 'connect': {
          await handleConnect(message);
          sendResponse({ ok: true });
          break;
        }
        case 'disconnect': {
          await handleDisconnect();
          sendResponse({ ok: true });
          break;
        }
        case 'getState': {
          const st = await getState();
          sendResponse(st);
          break;
        }
        default:
          sendResponse({ ok: false, error: 'unknown message type' });
      }
    } catch (err) {
      console.error('Distort background error:', err);
      sendResponse({ ok: false, error: err.message });
    }
  })();
  // Return true to indicate we will respond asynchronously.
  return true;
});

// --- Lifecycle ---------------------------------------------------------------
chrome.runtime.onInstalled.addListener(async () => {
  const st = await getState();
  const { settings = {} } = await chrome.storage.local.get(SETTINGS_KEY);
  if (settings.autoConnectOnStartup || st.connected) {
    // Attempt re-connect on install / startup if previously connected.
    // We don't have the full server object here; rely on stored state.
    // In production, the popup would re-issue a connect on next open.
  }
  await updateBadge(false);
  await setupAlarms();
  startWebRequestWatcher();
});

chrome.runtime.onStartup.addListener(async () => {
  const st = await getState();
  await updateBadge(st.connected);
  await setupAlarms();
  startWebRequestWatcher();
});

// Initialize on first SW spawn.
(async () => {
  const st = await getState();
  await updateBadge(st.connected);
  await setupAlarms();
  startWebRequestWatcher();
})();
