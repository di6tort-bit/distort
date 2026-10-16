// popup.js — Distort popup logic (MV3)
// Manages UI state, chrome.storage.local persistence, and messaging the service worker.

// --- Hard-coded server list (12 representative stealth nodes) -----------------
const SERVERS = [
  { id: 'de-fra-01', country: 'Germany',       city: 'Frankfurt',  flag: '🇩🇪', host: 'de-fra-01.distort.net', port: 8443, ping: 38,  load: 42, stealth: true  },
  { id: 'nl-ams-01', country: 'Netherlands',    city: 'Amsterdam',  flag: '🇳🇱', host: 'nl-ams-01.distort.net', port: 8443, ping: 44,  load: 51, stealth: true  },
  { id: 'fi-hel-01', country: 'Finland',        city: 'Helsinki',   flag: '🇫🇮', host: 'fi-hel-01.distort.net', port: 8443, ping: 58,  load: 33, stealth: true  },
  { id: 'fr-par-01', country: 'France',         city: 'Paris',      flag: '🇫🇷', host: 'fr-par-01.distort.net', port: 8443, ping: 49,  load: 60, stealth: true  },
  { id: 'tr-ist-01', country: 'Turkey',         city: 'Istanbul',   flag: '🇹🇷', host: 'tr-ist-01.distort.net', port: 8443, ping: 78,  load: 71, stealth: true  },
  { id: 'ae-dxb-01', country: 'UAE',            city: 'Dubai',      flag: '🇦🇪', host: 'ae-dxb-01.distort.net', port: 8443, ping: 96,  load: 65, stealth: true  },
  { id: 'sg-sin-01', country: 'Singapore',      city: 'Singapore',  flag: '🇸🇬', host: 'sg-sin-01.distort.net', port: 8443, ping: 112, load: 58, stealth: true  },
  { id: 'jp-tyo-01', country: 'Japan',          city: 'Tokyo',      flag: '🇯🇵', host: 'jp-tyo-01.distort.net', port: 8443, ping: 124, load: 47, stealth: true  },
  { id: 'ge-tbs-01', country: 'Georgia',        city: 'Tbilisi',    flag: '🇬🇪', host: 'ge-tbs-01.distort.net', port: 8443, ping: 84,  load: 38, stealth: true  },
  { id: 'am-evn-01', country: 'Armenia',        city: 'Yerevan',    flag: '🇦🇲', host: 'am-evn-01.distort.net', port: 8443, ping: 89,  load: 41, stealth: true  },
  { id: 'us-nyc-01', country: 'USA',            city: 'New York',   flag: '🇺🇸', host: 'us-nyc-01.distort.net', port: 8443, ping: 102, load: 55, stealth: false },
  { id: 'uk-lon-01', country: 'UK',             city: 'London',     flag: '🇬🇧', host: 'uk-lon-01.distort.net', port: 8443, ping: 67,  load: 49, stealth: false },
];

const PROTOCOLS = ['wireguard', 'v2ray', 'trojan', 'shadowsocks'];
const PROTOCOL_LABELS = { wireguard: 'WireGuard', v2ray: 'V2Ray', trojan: 'Trojan', shadowsocks: 'Shadowsocks' };
const MANIFEST_VERSION = '1.0.0';

// --- State --------------------------------------------------------------------
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

let state = { ...DEFAULT_STATE };
let statsTimer = null;
let sessionTimer = null;

// --- DOM refs ----------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const els = {
  versionPill:   $('versionPill'),
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

function renderAll() {
  renderConnectButton();
  renderServerCard();
  renderServerList(els.serverSearch.value);
  renderStats();
  // Protocol pills
  els.protoSelect.querySelectorAll('.proto-pill').forEach((b) => {
    b.classList.toggle('active', b.dataset.proto === state.protocol);
  });
  els.stealthToggle.checked = !!state.stealth;
  assessNetworkClimate();
}

// --- Storage -----------------------------------------------------------------
async function loadState() {
  const data = await chrome.storage.local.get(['distortState', 'settings']);
  if (data.distortState) {
    state = { ...state, ...data.distortState };
  }
  if (data.settings && typeof data.settings.protocol === 'string') {
    state.protocol = data.settings.protocol;
  }
  if (data.settings && typeof data.settings.stealthMode === 'boolean') {
    state.stealth = data.settings.stealthMode;
  }
  // If we were connected across popup reopens, verify with background.
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
    }
  } catch {
    // Background may be asleep; ignore.
  }
}

async function saveState() {
  await chrome.storage.local.set({ distortState: state });
}

// --- Connection --------------------------------------------------------------
async function connect() {
  if (state.connecting || state.connected) return;
  state.connecting = true;
  renderConnectButton();
  const server = currentServer();
  try {
    await chrome.runtime.sendMessage({
      type: 'connect',
      server,
      protocol: state.protocol,
      stealth: state.stealth,
    });
  } catch (err) {
    console.warn('connect message failed:', err);
  }
  // Background will ack via alarm / state poll; simulate transition.
  setTimeout(async () => {
    state.connecting = false;
    state.connected = true;
    state.sessionStart = Date.now();
    state.bytesDown = 0;
    state.bytesUp = 0;
    await saveState();
    renderAll();
    startStatsTimers();
  }, 900);
}

async function disconnect() {
  if (!state.connected && !state.connecting) return;
  state.connecting = false;
  state.connected = false;
  state.sessionStart = null;
  state.downSpeed = 0;
  state.upSpeed = 0;
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

// --- Stats timers (simulated traffic for demo purposes) ----------------------
function startStatsTimers() {
  stopStatsTimers();
  // Update session + simulated speeds every 1s.
  sessionTimer = setInterval(() => {
    renderStats();
  }, 1000);
  // Every 2s, simulate a new speed reading.
  statsTimer = setInterval(async () => {
    const srv = currentServer();
    // Simulate: better stealth servers give steadier speeds.
    const base = srv.stealth ? 18 : 12;
    state.downSpeed = (base + Math.random() * 35) * 1e6 / 8; // bytes/sec
    state.upSpeed = (base / 4 + Math.random() * 8) * 1e6 / 8;
    state.bytesDown += state.downSpeed * 2;
    state.bytesUp += state.upSpeed * 2;
    await saveState();
    renderStats();
  }, 2000);
}

function stopStatsTimers() {
  if (sessionTimer) { clearInterval(sessionTimer); sessionTimer = null; }
  if (statsTimer) { clearInterval(statsTimer); statsTimer = null; }
}

// --- Sync (best-effort fetch from web app) -----------------------------------
async function syncServers() {
  els.syncBtn.classList.add('syncing');
  els.syncBtn.querySelector('span').textContent = 'Syncing…';
  try {
    // Best-effort: try to fetch from the Distort web app.
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch('https://distort.app/api/servers.json', { signal: ctrl.signal });
    clearTimeout(t);
    if (res.ok) {
      const json = await res.json();
      if (Array.isArray(json) && json.length > 0) {
        // Validate / merge into our list (kept minimal: only update if shape matches).
        // We don't replace our hard-coded list to avoid breaking the demo.
        els.syncBtn.querySelector('span').textContent = `Synced ${json.length} servers`;
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
