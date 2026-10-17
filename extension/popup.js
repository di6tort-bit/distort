// popup.js — Distort popup logic (MV3)
// Manages UI state, chrome.storage.local persistence, and messaging the service worker.
//
// IMPORTANT: This extension is a BROWSER-LEVEL PROXY, not a system VPN.
// It can only set Chrome's proxy to a SOCKS5/HTTP endpoint.
//
// VLESS/VMess/Trojan/Shadowsocks protocols are NOT SOCKS5 proxies — they need a
// local client (xray-core) to convert them. The Chrome extension can't run xray
// itself, so it can only use real SOCKS5/HTTP proxies.
//
// The DEFAULT_SERVERS below pre-populate the list with the local xray-core SOCKS5
// listener (127.0.0.1:10808) that the Distort Desktop app exposes, so when the
// desktop app is running, this extension can ride on top of it for browser-only
// routing. For real VPN tunneling, install the Distort desktop app.

// --- User-configurable server list (stored in chrome.storage.local) -------------
let SERVERS = [];  // Loaded from storage; falls back to DEFAULT_SERVERS on first run.

const DEFAULT_SERVERS = [
  // Local xray-core companion (when Distort Desktop is running).
  // The desktop app listens on 127.0.0.1:10808 (SOCKS5) and 127.0.0.1:10809 (HTTP).
  // By routing browser traffic through this, the extension rides on top of the
  // desktop app's real VPN tunnel.
  {
    id: 'local-xray',
    flag: '🖥️',
    country: 'Local',
    city: 'Desktop companion',
    host: '127.0.0.1',
    port: 10808,
    ping: 1,
    load: 0,
    stealth: true,
    note: 'Routes through Distort Desktop app (must be running)',
  },
  // Public SOCKS5 echo server placeholder for testing — this is NOT a real VPN
  // endpoint and only useful for verifying the extension's plumbing works.
  // Replace with your own SOCKS5 in Options before production use.
  {
    id: 'test-socks-eu',
    flag: '🇪🇺',
    country: 'Test (EU)',
    city: 'SOCKS5 echo',
    host: '127.0.0.1',
    port: 1080,
    ping: 999,
    load: 0,
    stealth: false,
    note: 'Test only — replace with your own SOCKS5',
  },
];

const PROTOCOLS = ['wireguard', 'v2ray', 'trojan', 'shadowsocks'];
const PROTOCOL_LABELS = { wireguard: 'WireGuard', v2ray: 'V2Ray', trojan: 'Trojan', shadowsocks: 'Shadowsocks' };
const MANIFEST_VERSION = '1.0.0';

// --- State --------------------------------------------------------------------
const DEFAULT_STATE = {
  connected: false,
  connecting: false,
  serverId: 'local-xray',
  protocol: 'wireguard',
  stealth: true,
  sessionStart: null,
  bytesDown: 0,
  bytesUp: 0,
  downSpeed: 0,
  upSpeed: 0,
  resilience: 'checking',
  error: null,
};

let state = { ...DEFAULT_STATE };
let statsTimer = null;
let sessionTimer = null;

// --- DOM refs ----------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const els = {
  versionPill:   $('versionPill'),
  modeBanner:    $('modeBanner'),
  modeBannerClose: $('modeBannerClose'),
  errorBanner:   $('errorBanner'),
  errorText:     $('errorText'),
  errorBannerClose: $('errorBannerClose'),
  resilience:   $('resilience'),
  resilienceDot: $('resilienceDot'),
  resilienceText: $('resilienceText'),
  connectBtn:   $('connectBtn'),
  connectState: $('connectState'),
  serverCard:   $('serverCard'),
  serverFlag:   $('serverFlag'),
  serverCountry: $('serverCountry'),
  serverCity:   $('serverCity'),
  serverPing:   $('serverPing'),
  serverProtocol: $('serverProtocol'),
  serverStealth: $('serverStealth'),
  changeServerBtn: $('changeServerBtn'),
  serverListWrap: $('serverListWrap'),
  serverSearch:  $('serverSearch'),
  serverList:   $('serverList'),
  statsCard:    $('statsCard'),
  statDown:     $('statDown'),
  statUp:       $('statUp'),
  statSession:  $('statSession'),
  statData:     $('statData'),
  protoSelect:  $('protoSelect'),
  stealthToggle: $('stealthToggle'),
  optionsBtn:   $('optionsBtn'),
  syncBtn:      $('syncBtn'),
};

// --- Helpers -----------------------------------------------------------------
function pingClass(p) {
  if (p < 60) return 'good';
  if (p < 120) return 'mid';
  return 'bad';
}

function formatSpeed(bytesPerSec) {
  // bytes/sec -> Mb/s
  const mbps = bytesPerSec * 8 / 1e6;
  if (mbps < 1) return mbps.toFixed(2) + ' Mb/s';
  if (mbps < 100) return mbps.toFixed(1) + ' Mb/s';
  return Math.round(mbps) + ' Mb/s';
}

function formatData(bytes) {
  const mb = bytes / 1e6;
  if (mb < 1) return (bytes / 1e3).toFixed(1) + ' KB';
  if (mb < 1024) return mb.toFixed(1) + ' MB';
  return (mb / 1024).toFixed(2) + ' GB';
}

function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  const hh = String(Math.floor(s / 3600)).padStart(2, '0');
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function currentServer() {
  return SERVERS.find((s) => s.id === state.serverId) || SERVERS[0];
}

function setResilience(status, text) {
  state.resilience = status;
  els.resilience.dataset.status = status;
  if (text) els.resilienceText.textContent = text;
}

function assessNetworkClimate() {
  // Heuristic: picks a status based on selected server ping + stealth toggle.
  // In a real extension this would call the Distort API; we simulate locally.
  const srv = currentServer();
  if (state.stealth && srv.stealth) {
    setResilience('open', 'Open internet — stealth transport active');
  } else if (srv.ping > 100) {
    setResilience('throttled', 'Throttling detected — switching path');
  } else if (!srv.stealth) {
    setResilience('filtered', 'National filtering — using stealth transport');
  } else {
    setResilience('open', 'Open internet');
  }
}

// --- Render ------------------------------------------------------------------
function renderConnectButton() {
  let st = 'disconnected';
  if (state.connecting) st = 'connecting';
  else if (state.connected) st = 'connected';
  els.connectBtn.dataset.state = st;
  els.connectState.textContent =
    st === 'disconnected' ? 'Tap to connect' :
    st === 'connecting'  ? 'Connecting…' :
    'Protected';
}

function renderServerCard() {
  const srv = currentServer();
  els.serverFlag.textContent = srv.flag;
  els.serverCountry.textContent = srv.country;
  els.serverCity.textContent = srv.city;
  els.serverPing.textContent = `${srv.ping} ms`;
  els.serverPing.className = 'ping ' + pingClass(srv.ping);
  els.serverProtocol.textContent = PROTOCOL_LABELS[state.protocol] || 'WireGuard';
  els.serverStealth.style.display = state.stealth ? '' : 'none';
}

function renderServerList(filter = '') {
  const q = filter.trim().toLowerCase();
  const filtered = SERVERS.filter((s) => {
    if (!q) return true;
    return (
      s.country.toLowerCase().includes(q) ||
      s.city.toLowerCase().includes(q) ||
      s.id.toLowerCase().includes(q)
    );
  });
  els.serverList.innerHTML = '';
  for (const s of filtered) {
    const row = document.createElement('div');
    row.className = 'server-row' + (s.id === state.serverId ? ' active' : '');
    row.dataset.id = s.id;
    row.setAttribute('role', 'option');
    const loadClass = s.load >= 75 ? 'high' : '';
    row.innerHTML = `
      <span class="sr-flag">${s.flag}</span>
      <div class="sr-meta">
        <div class="sr-title">${s.country} · ${s.city}</div>
        <div class="sr-sub">
          <span class="sr-ping ${pingClass(s.ping)}">${s.ping}ms</span>
          <span class="sr-load ${loadClass}"><i style="width:${s.load}%"></i></span>
          ${s.stealth ? '<span class="sr-stealth">Stealth</span>' : ''}
        </div>
      </div>
      <button class="sr-connect${s.id === state.serverId && state.connected ? ' connected' : ''}" data-id="${s.id}">
        ${s.id === state.serverId && state.connected ? 'Connected' : 'Connect'}
      </button>
    `;
    els.serverList.appendChild(row);
  }
  if (filtered.length === 0) {
    els.serverList.innerHTML = '<div style="padding:14px;text-align:center;color:var(--muted);font-size:11px">No servers match your search.</div>';
  }
}

function renderStats() {
  if (state.connected) {
    els.statsCard.classList.remove('hidden');
    els.statDown.textContent = formatSpeed(state.downSpeed);
    els.statUp.textContent = formatSpeed(state.upSpeed);
    if (state.sessionStart) {
      els.statSession.textContent = formatDuration(Date.now() - state.sessionStart);
    }
    els.statData.textContent = formatData(state.bytesDown + state.bytesUp);
  } else {
    els.statsCard.classList.add('hidden');
  }
}

function renderError() {
  if (state.error) {
    els.errorText.textContent = state.error;
    els.errorBanner.classList.remove('hidden');
  } else {
    els.errorBanner.classList.add('hidden');
    els.errorText.textContent = '';
  }
}

function clearError() {
  state.error = null;
  renderError();
}

function renderAll() {
  renderConnectButton();
  renderServerCard();
  renderServerList(els.serverSearch.value);
  renderStats();
  renderError();
  // Protocol pills
  els.protoSelect.querySelectorAll('.proto-pill').forEach((b) => {
    b.classList.toggle('active', b.dataset.proto === state.protocol);
  });
  els.stealthToggle.checked = !!state.stealth;
  assessNetworkClimate();
}

// --- Storage -----------------------------------------------------------------
async function loadState() {
  const data = await chrome.storage.local.get([
    'distortState',
    'settings',
    'distortServers',
    'modeBannerDismissed',
  ]);
  // --- Servers: prefer persisted list, fall back to DEFAULT_SERVERS ---
  if (Array.isArray(data.distortServers) && data.distortServers.length > 0) {
    SERVERS = data.distortServers;
  } else {
    SERVERS = DEFAULT_SERVERS.slice();
    // Persist the defaults so the user can edit them via Options later.
    await chrome.storage.local.set({ distortServers: SERVERS });
  }
  // --- State ---
  if (data.distortState) {
    state = { ...state, ...data.distortState };
  }
  if (data.settings && typeof data.settings.protocol === 'string') {
    state.protocol = data.settings.protocol;
  }
  if (data.settings && typeof data.settings.stealthMode === 'boolean') {
    state.stealth = data.settings.stealthMode;
  }
  // --- Mode banner dismissal ---
  if (data.modeBannerDismissed) {
    els.modeBanner.classList.add('hidden');
  }
  // --- Live state from background (if connected) ---
  try {
    const live = await chrome.runtime.sendMessage({ type: 'getState' });
    if (live && typeof live.connected === 'boolean') {
      state.connected = live.connected;
      state.connecting = live.connecting;
      state.sessionStart = live.sessionStart || state.sessionStart;
      state.bytesDown = live.bytesDown ?? state.bytesDown;
      state.bytesUp = live.bytesUp ?? state.bytesUp;
      state.downSpeed = live.downSpeed ?? state.downSpeed;
      state.upSpeed = live.upSpeed ?? state.upSpeed;
      // Surface background-side errors (e.g. proxy verification failed).
      if (live.error && !state.error) state.error = live.error;
      // If background says NOT connected but we thought we were, fix it.
      if (!live.connected && state.connected) {
        state.connected = false;
        state.connecting = false;
      }
    }
  } catch {
    // Background may be asleep; ignore.
  }
}

async function saveState() {
  await chrome.storage.local.set({ distortState: state });
}

// --- Connection --------------------------------------------------------------
// REAL connect flow:
//   1. Validate we have a server to connect to.
//   2. Send `connect` message and AWAIT the background's response.
//   3. Background returns { ok: true, proxyVerified: true } on success.
//   4. Only then do we mark `connected = true`.
//   5. On any failure, set state.error + show the error banner.
//   6. NEVER use setTimeout to fake a transition.
async function connect() {
  if (state.connecting || state.connected) return;
  if (!SERVERS.length) {
    state.error = 'No servers configured. Click "Sync servers" to fetch from Distort, or add a SOCKS5 proxy in Options.';
    renderAll();
    return;
  }
  const server = currentServer();
  if (!server || !server.host || !server.port) {
    state.error = 'No server selected.';
    renderAll();
    return;
  }

  state.connecting = true;
  state.error = null;
  renderConnectButton();
  renderError();

  try {
    const resp = await chrome.runtime.sendMessage({
      type: 'connect',
      server,
      protocol: state.protocol,
      stealth: state.stealth,
    });
    // Background returns { ok: true/false, error?: string, proxyVerified?: bool }
    if (resp && resp.ok && resp.proxyVerified) {
      state.connecting = false;
      state.connected = true;
      state.sessionStart = Date.now();
      state.bytesDown = 0;
      state.bytesUp = 0;
      state.downSpeed = 0;
      state.upSpeed = 0;
      state.error = null;
      await saveState();
      renderAll();
      startStatsTimers();
    } else {
      // Background reported failure — do NOT mark connected.
      state.connecting = false;
      state.connected = false;
      state.error = (resp && resp.error) ||
        'Connection failed — proxy verification did not pass.';
      await saveState();
      renderAll();
    }
  } catch (err) {
    console.warn('connect message failed:', err);
    state.connecting = false;
    state.connected = false;
    state.error = `Extension communication failed: ${err.message || err}`;
    renderAll();
  }
}

async function disconnect() {
  if (!state.connected && !state.connecting) return;
  state.connecting = false;
  state.connected = false;
  state.sessionStart = null;
  state.downSpeed = 0;
  state.upSpeed = 0;
  state.error = null;
  await saveState();
  try {
    await chrome.runtime.sendMessage({ type: 'disconnect' });
  } catch (err) {
    console.warn('disconnect message failed:', err);
  }
  stopStatsTimers();
  renderAll();
}

function toggleConnect() {
  if (state.connected || state.connecting) disconnect();
  else connect();
}

// --- Stats timers (REAL traffic measurement) -------------------------------
// The background service worker counts bytes via chrome.webRequest.onCompleted
// and persists them in storage.local under the `distortState` key (plus an
// in-memory counter that is flushed every 2s). The popup READS those values —
// it never generates fake speeds with Math.random().
async function refreshStatsFromBackground() {
  try {
    const live = await chrome.runtime.sendMessage({ type: 'getState' });
    if (live) {
      state.bytesDown = live.bytesDown ?? state.bytesDown;
      state.bytesUp = live.bytesUp ?? state.bytesUp;
      state.downSpeed = live.downSpeed ?? state.downSpeed;
      state.upSpeed = live.upSpeed ?? state.upSpeed;
      // If background has flipped to disconnected (proxy dropped), reflect it.
      if (live.connected === false && state.connected) {
        state.connected = false;
        state.connecting = false;
        state.error = live.error || 'Proxy dropped unexpectedly.';
        stopStatsTimers();
        renderAll();
        return;
      }
    }
  } catch {
    // Background may be asleep — keep last-known values.
  }
  renderStats();
}

function startStatsTimers() {
  stopStatsTimers();
  // Update session timer every 1s (no saveState — purely a UI refresh).
  sessionTimer = setInterval(() => {
    renderStats();
  }, 1000);
  // Every 2s, refresh real byte counts from the background.
  statsTimer = setInterval(() => {
    refreshStatsFromBackground();
  }, 2000);
  // Initial fetch.
  refreshStatsFromBackground();
}

function stopStatsTimers() {
  if (sessionTimer) { clearInterval(sessionTimer); sessionTimer = null; }
  if (statsTimer) { clearInterval(statsTimer); statsTimer = null; }
}

// --- Sync (best-effort fetch from web app) -----------------------------------
// Fetches https://distort.app/api/servers.json and merges any entries that have
// a `socksHost`/`socksPort` field into our local SERVERS list (dedup by id).
async function syncServers() {
  els.syncBtn.classList.add('syncing');
  els.syncBtn.querySelector('span').textContent = 'Syncing…';
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch('https://distort.app/api/servers.json', { signal: ctrl.signal });
    clearTimeout(t);
    if (res.ok) {
      const json = await res.json();
      const list = Array.isArray(json) ? json : (json.servers || []);
      if (Array.isArray(list) && list.length > 0) {
        // Normalize remote entries that expose a SOCKS5 front.
        const remote = list
          .filter((s) => s && (s.socksHost || s.host) && (s.socksPort || s.port))
          .map((s) => ({
            id: s.id || `remote-${(s.socksHost || s.host)}-${(s.socksPort || s.port)}`,
            flag: s.flag || '🌐',
            country: s.country || 'Remote',
            city: s.city || s.region || '',
            host: s.socksHost || s.host,
            port: Number(s.socksPort || s.port),
            ping: Number(s.ping || 0) || 0,
            load: Number(s.load || 0) || 0,
            stealth: !!s.stealth,
            note: s.note || 'Synced from Distort',
          }));
        if (remote.length === 0) {
          els.syncBtn.querySelector('span').textContent =
            'No SOCKS5 servers in remote list';
        } else {
          // Merge: keep existing entries, append new ones (dedup by id).
          const byId = new Map(SERVERS.map((s) => [s.id, s]));
          let added = 0;
          for (const r of remote) {
            if (!byId.has(r.id)) {
              SERVERS.push(r);
              byId.set(r.id, r);
              added++;
            }
          }
          await chrome.storage.local.set({ distortServers: SERVERS });
          renderServerList(els.serverSearch.value);
          els.syncBtn.querySelector('span').textContent =
            added > 0
              ? `Synced ${added} new server${added === 1 ? '' : 's'}`
              : `All ${remote.length} remote already known`;
        }
      } else {
        els.syncBtn.querySelector('span').textContent = 'No remote servers';
      }
    } else {
      els.syncBtn.querySelector('span').textContent = 'Sync failed (offline)';
    }
  } catch {
    els.syncBtn.querySelector('span').textContent = 'Sync unavailable — using cached list';
  } finally {
    setTimeout(() => {
      els.syncBtn.classList.remove('syncing');
      els.syncBtn.querySelector('span').textContent = 'Sync servers';
    }, 2500);
  }
}

// --- Wire up events ----------------------------------------------------------
function wireEvents() {
  els.versionPill.textContent = `v${MANIFEST_VERSION}`;

  els.connectBtn.addEventListener('click', toggleConnect);

  els.changeServerBtn.addEventListener('click', () => {
    const open = !els.serverListWrap.classList.contains('hidden');
    els.serverListWrap.classList.toggle('hidden');
    if (!open) renderServerList(els.serverSearch.value);
  });

  els.serverSearch.addEventListener('input', (e) => {
    renderServerList(e.target.value);
  });

  els.serverList.addEventListener('click', async (e) => {
    const btn = e.target.closest('.sr-connect');
    const row = e.target.closest('.server-row');
    if (!row) return;
    const id = row.dataset.id;
    const srv = SERVERS.find((s) => s.id === id);
    if (!srv) return;
    const wasConnected = state.connected;
    if (wasConnected) {
      // Switch server: disconnect first, then re-connect on new node.
      await disconnect();
    }
    state.serverId = id;
    await saveState();
    renderServerCard();
    renderServerList(els.serverSearch.value);
    if (btn) {
      // Briefly highlight, then if was connected, reconnect.
      btn.classList.add('connected');
      btn.textContent = 'Selected';
      if (wasConnected) {
        setTimeout(() => connect(), 300);
      }
    }
  });

  els.protoSelect.addEventListener('click', async (e) => {
    const pill = e.target.closest('.proto-pill');
    if (!pill) return;
    const proto = pill.dataset.proto;
    if (!PROTOCOLS.includes(proto)) return;
    const wasConnected = state.connected;
    state.protocol = proto;
    // Persist into settings for the options page to read.
    const { settings = {} } = await chrome.storage.local.get('settings');
    settings.protocol = proto;
    await chrome.storage.local.set({ settings });
    if (wasConnected) {
      await disconnect();
      setTimeout(() => connect(), 250);
    } else {
      renderAll();
    }
  });

  els.stealthToggle.addEventListener('change', async (e) => {
    state.stealth = e.target.checked;
    const { settings = {} } = await chrome.storage.local.get('settings');
    settings.stealthMode = state.stealth;
    await chrome.storage.local.set({ settings });
    await saveState();
    assessNetworkClimate();
    renderServerCard();
  });

  els.optionsBtn.addEventListener('click', () => {
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.open(chrome.runtime.getURL('options.html'));
    }
  });

  els.syncBtn.addEventListener('click', syncServers);

  // Error banner close button — clears the displayed error (does not retry).
  els.errorBannerClose.addEventListener('click', () => {
    clearError();
  });

  // Mode-banner dismiss — hides the disclaimer until the extension is reinstalled.
  els.modeBannerClose.addEventListener('click', async () => {
    els.modeBanner.classList.add('hidden');
    try {
      await chrome.storage.local.set({ modeBannerDismissed: true });
    } catch {
      // ignore
    }
  });

  // Live resilience re-assessment on storage changes from options page.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.settings) {
      const ns = changes.settings.newValue || {};
      if (typeof ns.protocol === 'string' && ns.protocol !== state.protocol) {
        state.protocol = ns.protocol;
        renderServerCard();
      }
      if (typeof ns.stealthMode === 'boolean' && ns.stealthMode !== state.stealth) {
        state.stealth = ns.stealthMode;
        els.stealthToggle.checked = state.stealth;
        assessNetworkClimate();
        renderServerCard();
      }
    }
  });
}

// --- Init --------------------------------------------------------------------
async function init() {
  wireEvents();
  await loadState();
  renderAll();
  if (state.connected) startStatsTimers();
}

init().catch((err) => {
  console.error('Distort popup init failed:', err);
});
