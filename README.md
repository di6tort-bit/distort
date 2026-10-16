# DISTORT

**Freedom Beyond Borders** — an open-source privacy and connectivity project.

> **Status: early preview, not a working VPN.** This branch adds a desktop UI shell and a Chrome extension popup. Neither currently tunnels traffic, changes your public IP, or provides security protection.

## Version 0.1 foundation

- Windows desktop shell built with Electron, with context isolation, sandboxing, and Node integration disabled in the renderer.
- Chrome Manifest V3 extension with a minimal permission set and an explicit preview status.
- npm workspace, basic extension tests, CI workflow, contribution/security guidance, and Windows packaging script.
- MIT-licensed community development foundation.

## Run the Windows desktop preview

Requirements: Node.js 20.11 or newer and npm.

```sh
npm install
npm start
```

Or run `start.bat` on Windows.

## Load the Chrome extension preview

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Select **Load unpacked**.
4. Choose the repository's `apps/extension` folder.

The extension does not request proxy permissions and does not redirect browser traffic.

## Build a Windows installer

On a Windows machine, run `npm install`, then `npm run dist:win` or double-click `build-exe.bat`. Output is intended for `release/`. Windows packaging has not yet been verified on a Windows runner.

## Not implemented yet

No VPN tunnel, WireGuard integration, Windows tunnel driver/service, DNS or IPv6 leak protection, kill switch, proxy backend, trusted server list, community relay fleet, control plane, or donation infrastructure is implemented. The connect controls are intentionally disabled so the UI cannot misrepresent a connection.

See [docs/V1-IMPLEMENTATION.md](docs/V1-IMPLEMENTATION.md) and [docs/ROADMAP.md](docs/ROADMAP.md) for architecture and next steps. Do not rely on this preview for privacy or security.

## Community config preflight (experimental)

Until DISTORT has sponsored infrastructure, you can pre-filter an untrusted public config list for duplicate entries and TCP-reachable endpoints:

```sh
npm run configs:check
```

This downloads the configured community list and writes `distort-reachable-configs.txt` plus a metadata report. A reachable TCP port is **not** proof that the VPN protocol handshake or tunneled traffic works. This is only a preliminary filter; actual tunnel-based latency checks require a compatible protocol engine and are not implemented yet. Public configs may be unsafe or stop working at any time. See [docs/CONFIG-CHECKER.md](docs/CONFIG-CHECKER.md).
