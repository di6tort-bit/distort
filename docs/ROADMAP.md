# DISTORT — Roadmap & Gap Analysis

> Source: review of `https://github.com/di6tort-bit/distort` (Oct 2026) +
> everything implemented in this workspace.

---

## State of the upstream repo

The GitHub repo currently has two divergent branches:

### `main` — UI simulator
A polished Next.js 16 + Electron VPN client **UI simulator**. Beautiful design,
30 fake servers, simulated connect/disconnect, no real tunneling.
- Trusted `.env` and binary `db/custom.db` (should not be committed).
- No README, no LICENSE.

### `feat/windows-desktop-chrome-foundation` — honest minimal foundation
- MIT license, CI workflows, tests asserting "not a working VPN yet".
- `apps/desktop/` Electron shell with `contextIsolation` + `sandbox`.
- `apps/extension/` MV3 popup with `storage` permission only.
- `tools/config-checker.cjs` — community config preflight (Iran-focused).
- `docs/ROADMAP.md` — the single most valuable artifact: a complete gap analysis.

### Branding assets already present
- Name: **DISTORT** · Tagline: **Freedom Beyond Borders**
- Logo: twisted-ribbon "D" SVG with cyan→blue→violet gradient
- App IDs: `com.distort.app` / `org.distort.desktop`

---

## What this workspace added

A complete, runnable web platform that unifies the brand with real(ish)
functionality:

| Layer | Delivered |
|---|---|
| **Design system** | Distort palette, glassmorphism, mesh bg, conic spinner, pulse rings, grid overlay, custom scrollbar, Orbitron/Rajdhani fonts. |
| **Database** | Prisma schema (VpnServer, Session, VpnConfig, CommunityConfig, UserSetting, User) + 30 seeded servers (16 stealth) + 22 demo sessions + 4 community configs. |
| **Backend** | 15 App Router API handlers (servers, sessions, stats, settings, speedtest, connect, health-check, community-configs, account, config generation). |
| **Frontend** | Single-page app: landing (hero + features + download CTA) ↔ dashboard (connect / servers / speed test / stats / settings / account) with sidebar nav. |
| **Anti-censor** | Protocol ladder, network-climate assessment, auto-server pick, reachability probing, stealth filter, Iran neighbor gateways + domestic relay. |
| **Config gen** | WireGuard `.conf`, V2Ray JSON, Trojan JSON, Shadowsocks (with v2ray-plugin), SSH tunnel config. |
| **Chrome ext** | Full MV3 extension: popup with 12 servers, background service worker (`chrome.proxy.settings` SOCKS5), options page, icons, stealth status, Iran-resilience ladder docs. |

---

## What is still missing for a production VPN

This is the honest gap list. The web app **simulates** the tunnel; a real VPN
needs the items below. They are the same items called out by the upstream
`docs/ROADMAP.md`, restated here so nothing is lost.

### Phase 1 — Real tunnel engine
- [ ] **WireGuard userspace driver** integration (`wireguard-go` / `boringtun`).
- [ ] **TUN device** management on Windows (wintun.dll), macOS, Linux.
- [ ] **Privileged helper / system service** for tunnel bring-up (Windows service,
  macOS launchd, Linux systemd unit).
- [ ] **Key lifecycle**: generate, rotate, revoke per-user keys via control plane.
- [ ] **Signed config** distribution with key fingerprint verification.

### Phase 2 — Stealth transports (real)
- [ ] **V2Ray core** or `sing-box` as a subprocess with IPC.
- [ ] **Trojan-Go** / `trojan` binary integration.
- [ ] **Shadowsocks** (`shadowsocks-rust`) + `v2ray-plugin` binary.
- [ ] **Pluggable transport v3** (Snowflake, obfs4) for the hardest cases.
- [ ] **Domain fronting** config for CDN-fronted entries.

### Phase 3 — Security guarantees (enforce, not just toggle)
- [ ] **Kill switch** — firewall rules that block non-tunnel egress.
- [ ] **DNS leak protection** — force DNS through tunnel; block plaintext DNS to ISP.
- [ ] **IPv6 leak protection** — disable IPv6 or route it through the tunnel.
- [ ] **Split tunneling** — per-app routing rules (Windows: WFP, Linux: nftables cgroups).
- [ ] **Always-on / block-when-disconnected** mode on mobile.

### Phase 4 — Real infrastructure
- [ ] **Control plane** — issuing keys, pushing server lists, rotating exits.
- [ ] **Provisioning** — Terraform/Ansible for spinning relay nodes.
- [ ] **Monitoring** — Prometheus + Grafana for load/latency/abuse.
- [ ] **Abuse handling** — DMCA flow, bandwidth caps for free tier if abuse occurs.
- [ ] **Community relay fleet** — let volunteers run exit nodes (with policy).

### Phase 5 — Trust & distribution
- [ ] **Code signing** — Windows EV cert, macOS notarization, GPG-signed Linux packages.
- [ ] **Reproducible builds** + SBOM (CycloneDX).
- [ ] **Independent security audit** + published report.
- [ ] **Privacy policy** + threat model + vulnerability disclosure process.
- [ ] **iOS / Android** native apps (WireGuard-backed + stealth fallback).

### Phase 6 — UX & i18n
- [ ] **Persian (RTL) localization** — the default config-checker source is already Iran-focused.
- [ ] **Onboarding flow** for first-time users behind a firewall.
- [ ] **Accessibility audit** (WCAG AA — current dashboard is semantic + keyboard-friendly, needs formal pass).
- [ ] **Telemetry opt-in/out** (crash + performance, never traffic).

---

## Repo hygiene fixes (carry into upstream)

- [ ] Remove tracked `.env` and binary `db/custom.db`.
- [ ] Add `.gitignore` for `db/*.db`, `.env`, `.next/`, `node_modules/`.
- [ ] Add `LICENSE` (MIT) — done on feat branch, missing on main.
- [ ] Add this `README.md` + `docs/ROADMAP.md`.
- [ ] Keep the `extension/` folder self-contained (no Next.js imports).
- [ ] Sign tags + maintain a `CHANGELOG.md`.

---

## Suggested branch strategy

1. Keep `main` as the **production-ready** branch (web app + extension + docs).
2. Use `feat/tunnel-engine` for Phase 1+2 (real WireGuard / V2Ray core).
3. Use `feat/infra` for Phase 4 (control plane + provisioning).
4. Tag releases `v1.0.0-rc.*` once the tunnel engine lands.

---

Distort is built for the moments that matter most.
