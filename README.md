# DISTORT — Freedom Beyond Borders

> A 100% free, next-generation VPN built to stay online when the internet goes dark.
> Multi-protocol, anti-censorship, Iran-resilient. Open source.

<p align="center">
  <img src="./public/logo.svg" width="120" alt="DISTORT logo" />
</p>

---

## What is Distort?

Distort is a free, open-source VPN platform engineered for hostile network
environments. When DPI, SNI blocking, or a national intranet kicks in, ordinary
VPNs die. Distort climbs a **protocol ladder** — WireGuard → V2Ray (VMess) →
Trojan → Shadowsocks → SSH — automatically routing around censorship until your
traffic flows again.

This repository contains:

1. **Web dashboard** (`/`) — the main control center (Next.js 16).
2. **Backend API** (`/api/*`) — servers, sessions, stats, config generation, health checks.
3. **Chrome extension** (`/extension/`) — Manifest V3 browser-level proxy.
4. **Shared libs** (`src/lib/`) — config generator, anti-censor engine, VPN store.

---

## Brand

| Token | Value | Usage |
|---|---|---|
| `--void` | `#050814` | App background |
| `--surface` | `#0d1426` | Cards |
| `--cyan` | `#00f0ff` | Primary accent, active states |
| `--blue` | `#2962ff` | Secondary accent |
| `--violet` | `#8b5cf6` | Stealth / anti-censor |
| `--emerald` | `#10d9a0` | Success / online |
| `--amber` | `#ffb020` | Warning / premium |
| `--rose` | `#ff4d6d` | Danger / kill switch |

- **Logo**: twisted-ribbon "D" mark, gradient cyan→blue→violet.
- **Fonts**: Orbitron (display), Rajdhani (tech), Geist (body).
- **Tagline**: *Freedom Beyond Borders*.

---

## Quick Start

```bash
bun install
bun run db:push     # create the SQLite schema
bun run db:seed     # seed 30 servers + demo sessions + community configs
bun run dev         # start the web app at http://localhost:3000
```

Open the **Preview Panel** (do not visit `localhost:3000` directly — it is
internal). Click **Launch Distort** to open the dashboard.

### Chrome extension

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `extension/` folder

---

## The Dashboard

| View | What it does |
|---|---|
| **Connect** | One-tap power button with live metrics, pulse rings, climate indicator. |
| **Servers** | 30+ nodes across 26 countries. Stealth filter, premium filter, search, ping/load bars. |
| **Speed Test** | Animated gauge measuring download/upload/ping/jitter to the active node. |
| **Statistics** | KPI cards + 7-day traffic area chart + protocol distribution (pie + bar). |
| **Settings** | Protocol cards, security toggles, anti-censorship ladder, network inputs. |
| **Account** | Free account, config generator (WireGuard/V2Ray/Trojan/SS/SSH), app downloads. |

---

## Iran-Resilience Design

Distort was built specifically to keep working when Iran's national intranet
activates. The strategy:

1. **Multi-protocol ladder** — if one transport is blocked, the next is tried automatically.
2. **Stealth nodes** — 16 of the 30 nodes run obfuscated transports (Trojan/V2Ray-WS-TLS/SS+v2ray-plugin).
3. **Neighbor gateways** — Turkey (Istanbul, 18ms), UAE (Dubai, 24ms), Armenia (Yerevan, 28ms), Georgia (Tbilisi, 32ms) for low-latency exits from Iran.
4. **Domestic relay** — an in-country relay (`ir-nrt-relay`) that only forwards to the borders without providing an exit, reducing exposure.
5. **Community configs** — pull public VLESS/VMess/Trojan/SS lists and TCP-probe them for reachability.
6. **Kill switch + DNS/IPv6 leak protection** — even if the tunnel drops, your real IP never leaks.

---

## API Reference

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/servers` | List all nodes (online first, then ping asc). |
| GET | `/api/servers/[id]` | Single server. |
| GET/POST | `/api/servers/[id]/config` | Generate + persist a config. |
| GET | `/api/servers/recommended` | Auto-pick best node + climate assessment. |
| GET | `/api/servers/[id]/health` | TCP-probe a single node. |
| GET/POST | `/api/sessions` | List / create sessions. |
| GET/PATCH/DELETE | `/api/sessions/[id]` | Read / update / end a session. |
| GET | `/api/stats` | Aggregates + chart-ready daily + protocol breakdown. |
| GET/PUT | `/api/settings` | Read / update the default settings row. |
| POST | `/api/speedtest` | Simulated speed test, persists a synthetic session. |
| POST | `/api/connect` | `{ action: "connect" \| "disconnect" }`. |
| GET/POST | `/api/health-check` | Probe one or all servers. |
| GET/POST | `/api/community-configs` | List / add community configs. |
| POST | `/api/community-configs/check` | Probe + update reach for all community configs. |
| GET/POST | `/api/account` | Read demo account / create a free user. |

---

## Tech Stack

- **Next.js 16** (App Router, Turbopack) + **React 19** + **TypeScript 5**
- **Tailwind CSS 4** + **shadcn/ui** (New York)
- **Prisma** + **SQLite** (file: `db/custom.db`)
- **Zustand** (client state) + **Framer Motion** + **Recharts**
- **Orbitron / Rajdhani / Geist** fonts
- **z-ai-web-dev-sdk** available for AI features

---

## Project Structure

```
.
├── prisma/schema.prisma        # VpnServer, Session, VpnConfig, CommunityConfig, UserSetting, User
├── src/
│   ├── app/
│   │   ├── page.tsx            # Single-page app: landing ↔ dashboard
│   │   ├── layout.tsx          # Fonts, metadata, toasters
│   │   ├── globals.css         # Distort design system
│   │   └── api/                # 15 route handlers
│   ├── lib/
│   │   ├── db.ts               # Prisma client
│   │   ├── vpn-data.ts         # 30-node seed + protocol metadata
│   │   ├── vpn-store.ts        # Zustand store with live traffic ticker
│   │   ├── config-generator.ts # WireGuard/V2Ray/Trojan/SS/SSH configs
│   │   ├── anti-censor.ts      # Climate assessment, auto-pick, reachability
│   │   └── seed.ts             # DB seed
│   ├── components/
│   │   ├── vpn/                # logo, dashboard, connect, servers, stats, settings, speedtest, account
│   │   ├── landing/            # hero, features, download
│   │   ├── site-header.tsx
│   │   └── site-footer.tsx
│   └── hooks/use-fetch.ts
├── extension/                  # MV3 Chrome extension (self-contained)
│   ├── manifest.json
│   ├── popup.html / .css / .js
│   ├── background.js           # service worker: proxy.settings, badges, alarms
│   ├── options.html / .css / .js
│   ├── icons/                  # SVG + 16/32/48/128 PNGs
│   └── README.md
└── docs/ROADMAP.md             # Gap analysis + phased delivery plan
```

---

## License

MIT — Distort is and will remain **100% free**.

Freedom Beyond Borders.
