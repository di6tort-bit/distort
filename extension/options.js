// options.js — Distort settings page logic.
// Reads/writes the "settings" key in chrome.storage.local.

const MANIFEST_VERSION = '1.0.0';

const DEFAULT_SETTINGS = {
  killSwitch: true,
  dnsLeakProtection: true,
  ipv6LeakProtection: true,
  blockTrackers: true,
  blockAds: false,
  obfuscation: true,
  autoConnectOnStartup: false,
  stealthMode: true,
  protocol: 'wireguard',
  preferredRegion: 'auto',
  mtu: 1420,
  dnsServers: '1.1.1.1, 9.9.9.9',
};

const SETTINGS_KEY = 'settings';
const STATE_KEY = 'distortState';

// --- DOM helpers -------------------------------------------------------------
const $ = (id) => document.getElementById(id);

const els = {
  versionPill:   $('versionPill'),
  toggles:       document.querySelectorAll('.toggle-row input[type="checkbox"]'),
  protoRadios:   document.querySelectorAll('#protoRadios input[name="protocol"]'),
  preferredRegion: $('preferredRegion'),
  mtu:           $('mtu'),
  dnsServers:    $('dnsServers'),
  saveBtn:       $('saveBtn'),
  cancelBtn:     $('cancelBtn'),
  resetBtn:      $('resetBtn'),
  toast:         $('toast'),
};

// --- Load/save ---------------------------------------------------------------
async function loadSettings() {
  const data = await chrome.storage.local.get(SETTINGS_KEY);
  const settings = { ...DEFAULT_SETTINGS, ...(data[SETTINGS_KEY] || {}) };
  els.toggles.forEach((input) => {
    input.checked = !!settings[input.dataset.key];
  });
  els.protoRadios.forEach((input) => {
    input.checked = input.value === settings.protocol;
  });
  els.preferredRegion.value = settings.preferredRegion || 'auto';
  els.mtu.value = settings.mtu ?? 1420;
  els.dnsServers.value = settings.dnsServers || '';
}

async function collectSettings() {
  const out = {};
  els.toggles.forEach((input) => {
    out[input.dataset.key] = input.checked;
  });
  const protoChecked = Array.from(els.protoRadios).find((r) => r.checked);
  out.protocol = protoChecked ? protoChecked.value : 'wireguard';
  out.preferredRegion = els.preferredRegion.value || 'auto';
  out.mtu = Math.min(1500, Math.max(576, Number(els.mtu.value) || 1420));
  out.dnsServers = els.dnsServers.value.trim();
  return out;
}

async function saveSettings() {
  const settings = await collectSettings();
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
  showToast('Settings saved', false);
}

async function resetAll() {
  if (!confirm('Reset all Distort settings and disconnect?')) return;
  await chrome.storage.local.set({ [SETTINGS_KEY]: DEFAULT_SETTINGS });
  await chrome.storage.local.remove(STATE_KEY);
  // Tell background to disconnect.
  try {
    await chrome.runtime.sendMessage({ type: 'disconnect' });
  } catch {
    // ignore
  }
  await loadSettings();
  showToast('Everything reset', true);
}

// --- Toast -------------------------------------------------------------------
let toastTimer = null;
function showToast(message, isDanger) {
  els.toast.textContent = message;
  els.toast.classList.toggle('danger', !!isDanger);
  els.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    els.toast.classList.remove('show');
  }, 2200);
}

// --- Init --------------------------------------------------------------------
function wireEvents() {
  els.versionPill.textContent = `v${MANIFEST_VERSION}`;
  els.saveBtn.addEventListener('click', saveSettings);
  els.cancelBtn.addEventListener('click', () => {
    // Reload settings from storage (discards unsaved changes).
    loadSettings();
    showToast('Changes discarded', true);
  });
  els.resetBtn.addEventListener('click', resetAll);
}

async function init() {
  wireEvents();
  await loadSettings();
}

init().catch((err) => {
  console.error('Distort options init failed:', err);
});
