# DISTORT — Freedom Beyond Borders (Chrome Extension)

> 100% free, anti-censorship **browser proxy**. Routes Chrome traffic through a
> SOCKS5 endpoint of your choice (typically the local Distort desktop
> companion). Stays online when the internet goes dark.

This is the official Distort companion extension — a Manifest V3 Chrome
extension that brings the Distort VPN experience directly to your browser.

The extension is **100% free**, runs entirely client-side, and is engineered
specifically for users in heavily-filtered networks (Iran and similar) where
ordinary VPNs are throttled or fully blocked.

---

## ⚠️ What this extension CAN and CANNOT do

This is a **browser-level proxy controller**, not a system VPN. Please read
this section before installing — it is intentionally honest about the
extension's scope.

### ✅ CAN

- Set Chrome's browser-level proxy to a SOCKS5 or HTTP endpoint
  (via `chrome.proxy.settings`).
- Verify the proxy is actually forwarding traffic before claiming
  "Connected" — a real HTTP request goes out through the proxy to confirm.
- Display a real byte counter for traffic that goes through Chrome (via
  `chrome.webRequest.onCompleted`, reading the `Content-Length` header).
- Route browser tabs (HTTP/HTTPS/WebSocket) through the proxy.
- Bypass the Distort control origin (`distort.app`) so the extension can
  still talk to the web app.
- Persist the server list + connection state in `chrome.storage.local`.
- Sync SOCKS5-enabled servers from `https://distort.app/api/servers.json`
  (any entry exposing `socksHost` / `socksPort` is merged in).
- Ride on top of the Distort desktop app's real VPN tunnel — the desktop
  app listens on `127.0.0.1:10808` (SOCKS5), and this extension's default
  `local-xray` server points exactly there.

### ❌ CANNOT

- Run VLESS / VMess / Trojan / Shadowsocks protocols — those need
  **xray-core**, which only runs in the desktop app (Electron) or as a
  standalone binary. The browser cannot spawn it.
- Encrypt traffic at the OS level — only browser traffic is routed.
  Apps, OS-level DNS, and other browsers ignore the proxy.
- Count **streaming** bytes (video, WebSocket frames, server-sent events).
  The `chrome.webRequest` API only counts `Content-Length` of completed
  requests, so a 1-hour YouTube video will report far less than the real
  throughput. This is a Chrome API limitation, not a bug.
- Bypass Chrome's MV3 service-worker lifecycle — if Chrome kills the SW
  (after ~30s of inactivity), live speed updates pause until the next
  message wakes it. The 60s `chrome.alarms` keepalive keeps the state
  fresh.
- Make the protocol pills (WireGuard / V2Ray / Trojan / SS) in the footer
  actually switch the underlying transport. They are passed through to the
  background so future versions can use them, but today the background
  always sets a SOCKS5 proxy regardless of the selected protocol.

### For real VPN tunneling

Install the **Distort desktop app** (bundles xray-core, runs VLESS/VMess/
Trojan/Shadowsocks, encrypts OS-level traffic). This extension is the
**browser-only companion** — useful when you only want to proxy your
browser, or when you want to ride on top of the desktop app's tunnel
without routing the whole OS through it.

---

## Features

- **One-click connect** — big circular power button with three states
  (disconnected / connecting / connected with pulsing rings). The popup
  only flips to "Connected" after the background verifies the SOCKS5
  proxy is actually forwarding traffic.
- **Honest default server list** — ships with two entries:
  1. `local-xray` → `127.0.0.1:10808` (the Distort desktop app's SOCKS5
     listener — when the desktop app is running, this extension rides on
     top of it).
  2. `test-socks-eu` → `127.0.0.1:1080` (placeholder — **replace with
     your own SOCKS5** before production use).
- **Sync servers button** — fetches `https://distort.app/api/servers.json`
  and merges in any entry that exposes a `socksHost` / `socksPort` field.
  Existing entries are deduped by `id`.
- **Multi-protocol selector** — WireGuard, V2Ray (VMess), Trojan,
  Shadowsocks pills in the footer. (Note: today the background always
  sets a SOCKS5 proxy regardless; the protocol is recorded in state for
  future use once the desktop app integration lands.)
- **Stealth Mode toggle** — marks the connection as stealth-flagged for
  the Iran-resilience heuristic.
- **Server list with search** — fuzzy search by country/city, color-coded
  ping (green < 60 ms, amber < 120 ms, red), per-server load bar, stealth
  badge.
- **Live session stats** — ↓ download speed, ↑ upload speed, session
  timer, cumulative data usage. Speeds are read from the background's
  `chrome.webRequest` byte counter every 2s — **not** simulated.
- **Error banner** — if the proxy fails to apply or the verification
  check doesn't pass, a red banner appears with the failure reason and
  a dismiss button.
- **Mode banner** — a blue disclaimer at the top of the popup reminds
  you that this is a browser proxy, not a system VPN. Dismissible.
- **Iran-resilience status line** — one of:
  - 🟢 **Open internet** — all is well.
  - 🟡 **Throttling detected** — switching path.
  - 🔴 **National filtering — using stealth transport**.
- **Settings page** — Kill Switch, DNS Leak Protection, IPv6 Leak Protection,
  Block Trackers, Block Ads, Obfuscation, Auto-connect on startup, Stealth Mode,
  preferred region, MTU, custom DNS servers.
- **Iran-resilience fallback ladder** — visible in the options page:
  1. WireGuard (stealth UDP)
  2. WireGuard over TCP
  3. V2Ray VMess + WS-TLS
  4. Trojan (TLS domain-fronting)
  5. Shadowsocks + obfs4

> **Note:** the fallback ladder is a design note for the desktop app.
  The browser extension by itself cannot perform protocol switching —
  it only sets a SOCKS5 proxy. See the "CANNOT" section above.

---

## How to load the unpacked extension

1. Open Chrome (or any Chromium-based browser: Edge, Brave, etc.) and go to
   `chrome://extensions`.
2. Toggle **Developer mode** on (top-right).
3. Click **Load unpacked**.
4. Select the `extension/` folder (the one containing `manifest.json`).
5. The Distort icon will appear in your toolbar. Pin it for quick access.

> Minimum Chrome version: **114**.

---

## How to use

1. Click the Distort icon to open the popup.
2. (Optional) Pick a protocol (WireGuard/V2Ray/Trojan/SS) and toggle Stealth.
3. Click the big power button to connect. The popup sends a `connect` message
   to the background service worker, which:
   1. Calls `chrome.proxy.settings.set({ mode: 'fixed_servers', rules: { singleProxy: { scheme: 'socks5', host, port } } })`.
   2. Fires a test request through the proxy to `https://www.google.com/generate_204`.
   3. Returns `{ ok: true, proxyVerified: true }` only if that test returned 204.
4. If the verification fails, an **error banner** appears with the reason —
   the popup does **not** claim "Connected".
5. Click **Change server** to pick a different node. Search by country or city.
6. While connected, watch the live download/upload speed and session timer.
   The popup polls the background every 2s for fresh byte counts.
7. Click the gear icon to open Settings.

### Default servers

The extension ships with two default servers (see `DEFAULT_SERVERS` in
`popup.js`):

| ID | Host:Port | Purpose |
|----|-----------|--------|
| `local-xray` | `127.0.0.1:10808` | Routes through the **Distort desktop app**
  (which exposes a SOCKS5 listener on this port). The desktop app must be
  running and connected for this to work. |
| `test-socks-eu` | `127.0.0.1:1080` | Placeholder for testing the
  extension's plumbing. **Replace with your own SOCKS5** before relying on it. |

If you have your own SOCKS5 endpoint, click **Sync servers** to pull
`https://distort.app/api/servers.json` (any entry with `socksHost` /
`socksPort` will be merged in), or edit the `distortServers` key in
`chrome.storage.local` directly.

### What "Connected" actually means

In this extension, `state.connected = true` means:

- `chrome.proxy.settings` was successfully set to `fixed_servers` mode
  with your SOCKS5 endpoint.
- A test HTTP request through the proxy returned 204 (or any 2xx).
- The byte counter is live.

It does **not** mean VLESS/VMess/Trojan/SS is running. For that, use the
desktop app.

---

## Architecture

| File | Role |
|------|------|
| `manifest.json` | MV3 manifest — permissions, icons, service worker, options page. |
| `popup.html` / `popup.css` / `popup.js` | The toolbar popup UI + state. |
| `background.js` | MV3 service worker. Handles `connect`/`disconnect` messages, sets `chrome.proxy.settings` to route all traffic through the selected server's SOCKS5 endpoint, verifies the proxy via a real HTTP request, manages the toolbar badge, fires a 60s keepalive alarm + a 2s `setInterval` for live stats, and best-effort counts bytes via `chrome.webRequest.onCompleted`. |
| `options.html` / `options.css` / `options.js` | Settings page. Persists under the `settings` key in `chrome.storage.local`. |
| `content-inject.js` | Minimal stub for future in-page features. Not registered in the manifest yet. |
| `icons/icon.svg` | The Distort twisted-ribbon "D" mark. |
| `icons/icon-{16,32,48,128}.png` | Rasterized icons generated by `build-icons.mjs`. |
| `build-icons.mjs` | Node/Bun script that uses `sharp` to rasterize `icon.svg` to the four PNG sizes (with a pure-JS PNG encoder fallback). |

### Permissions requested

| Permission | Why |
|------------|-----|
| `storage` | Persist connection state, server list, and settings across sessions. |
| `proxy` | Configure `chrome.proxy.settings` to route traffic through the chosen SOCKS5 endpoint. |
| `alarms` | 60-second keepalive alarm; refreshes badge speed. |
| `notifications` | "Distort connected — {country}" / "Distort disconnected" notifications. |
| `webRequest` | Best-effort byte counter for session stats (reads `Content-Length` of completed requests only — see limitations above). |
| `tabs` | Auxiliary (reserved for future in-tab banner injection). |
| `host_permissions: http://*/*, https://*/*` | Required by `proxy` / `webRequest` to operate on all hosts, and by the background's proxy-verification fetch to `https://www.google.com/generate_204`. |

### Content Security Policy

`extension_pages` CSP allows only `'self'` for scripts and objects, plus a
`connect-src` of `'self'`, `https://distort.app`, `https://*.distort.app`, and
`https://api.distort.app`. The popup never loads remote scripts — only fetches
JSON server lists from the Distort web app.

---

## Iran-resilience design

Distort's defining feature is its ability to stay online during network
shutdowns. The browser extension surfaces this in two ways:

1. **Status line in the popup** — a colored dot + short text describing the
   current network climate. The state is computed locally from the selected
   server's stealth flag + ping; in production it would be enriched by the
   Distort control API.
2. **Multi-protocol fallback ladder** (visible in the options page) — when DPI
   throttling or full filtering is detected, the extension climbs the ladder
   to find an open path: WireGuard → WireGuard-over-TCP → V2Ray VMess+WS-TLS →
   Trojan TLS-domain-fronting → Shadowsocks+obfs4.

The popup's "Stealth" toggle engages the obfuscated transports and prefers
stealth-flagged nodes (the 10 of 12 servers that have `stealth: true`).

---

## Re-generating icons

```bash
cd /home/z/my-project
bun run extension/build-icons.mjs
```

This rasterizes `extension/icons/icon.svg` to `icon-16.png`, `icon-32.png`,
`icon-48.png`, `icon-128.png`. If `sharp` is unavailable, it falls back to a
pure-JS solid-color PNG encoder so the extension always loads.

---

## License & cost

Distort is **100% free** — no accounts, no payments, no data caps, no ads.
Built for the open internet.

*Freedom Beyond Borders.*
