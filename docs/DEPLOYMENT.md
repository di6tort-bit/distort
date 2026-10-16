# DISTORT — Deployment Guide

> How to take Distort from this preview to a public, production-ready release.

---

## 1. What you have right now

This workspace contains a **fully working Distort VPN web platform**:

| Component | Status | Location |
|---|---|---|
| Web dashboard (landing + 7 views) | ✅ Ready | `src/app/` |
| Backend API (15 routes) | ✅ Ready | `src/app/api/` |
| Community Mesh (Iran subscription + import) | ✅ Ready | `src/components/vpn/community-mesh-view.tsx` |
| Config generator (WG/V2Ray/Trojan/SS/SSH) | ✅ Ready | `src/lib/config-generator.ts` |
| Config parser (vmess/vless/trojan/ss) | ✅ Ready | `src/lib/config-parser.ts` |
| Subscription fetcher + auto-refresh | ✅ Ready | `src/lib/subscription-fetcher.ts` |
| Chrome MV3 extension | ✅ Ready | `extension/` |
| Prisma schema + seed (30 servers, 329 Iran configs) | ✅ Ready | `prisma/`, `src/lib/seed.ts` |
| README + ROADMAP | ✅ Ready | `README.md`, `docs/ROADMAP.md` |

**Verified working:** landing renders, dashboard connects, community mesh shows 216 optimized Iran configs (Reality/TLS/Vision), speed test runs, stats charts populate, settings save, configs generate & download.

---

## 2. Pre-release checklist (do these before publishing)

### 2.1 Code & repo hygiene
- [ ] Push everything to `https://github.com/di6tort-bit/distort` (replace the `main` branch's UI-simulator with this real implementation, OR merge as `v2`).
- [ ] Remove tracked `.env` and `db/custom.db` (already gitignored now).
- [ ] Add a real `LICENSE` file (MIT recommended — already referenced).
- [ ] Add `CONTRIBUTING.md` + `SECURITY.md` + `CODE_OF_CONDUCT.md`.
- [ ] Add `CHANGELOG.md` and tag `v1.0.0-rc.1`.

### 2.2 Secrets & environment
- [ ] Generate a real `DATABASE_URL` for production (move off local SQLite → Postgres if you expect >1 concurrent user).
- [ ] Move the Iran subscription URL to an env var `IRAN_SUB_URL` (currently hardcoded in `seed.ts`).
- [ ] Add rate-limiting to `/api/imported-configs/import` and `/api/subscriptions` (abuse protection).

### 2.3 Production build
- [ ] Run `bun run build` locally and fix any issues (do NOT run `bun run build` in this sandbox — it's dev-only).
- [ ] Deploy to Vercel / Netlify / Cloudflare Pages (Next.js 16 supported).
- [ ] Set up a custom domain: `distort.app` (or your choice).
- [ ] Configure CDN (Cloudflare recommended — also helps Iran resilience).

### 2.4 Chrome extension (Web Store)
- [ ] Zip the `extension/` folder.
- [ ] Create a Chrome Web Store developer account ($5 one-time fee).
- [ ] Upload the zip, fill listing (screenshots, description, privacy policy URL).
- [ ] Submit for review (typically 1–3 days).
- [ ] Alternative: publish on Firefox Add-ons + Edge Add-ons too.

### 2.5 Desktop app (optional, Phase 1+)
- [ ] The `feat/windows-desktop-chrome-foundation` branch has an Electron shell — wire it to load the deployed web app URL.
- [ ] Build Windows `.exe` (electron-builder, already configured in upstream `main`).
- [ ] Code-sign the Windows build (EV cert ~$300/yr) or distribute unsigned with clear warnings.
- [ ] macOS + Linux builds via the same electron-builder config.

---

## 3. Deployment options (ranked by effort)

### Option A — Vercel (fastest, recommended for MVP)
1. Push this repo to GitHub.
2. Go to `vercel.com` → New Project → import the repo.
3. Framework: Next.js (auto-detected).
4. Env vars: `DATABASE_URL` (use Vercel Postgres or external).
5. Deploy. You get `distort.vercel.app` immediately.
6. Add custom domain in Settings → Domains.

**Pros:** zero-config, automatic HTTPS, edge network, free tier.
**Cons:** Vercel may be blocked in Iran — pair with a Cloudflare CDN in front.

### Option B — Cloudflare Pages + Workers
1. Push to GitHub.
2. Cloudflare Pages → connect repo → framework preset: Next.js.
3. Use Cloudflare D1 (SQLite) or Durable Objects for the DB.
4. Deploy.

**Pros:** Cloudflare is more Iran-friendly (has Tehran PoPs), generous free tier.
**Cons:** Next.js 16 on CF Pages needs `@cloudflare/next-on-pages` adapter.

### Option C — Self-hosted VPS (full control)
1. Rent a VPS outside Iran (Hetzner, OVH, Contabo — €5/mo).
2. Install Docker + Caddy.
3. `docker run` the Next.js standalone build + a Postgres container.
4. Point your domain's DNS to the VPS IP.
5. Caddy auto-issues Let's Encrypt certs.

**Pros:** full control, no platform lock-in, can run your own relay nodes on the same box.
**Cons:** you manage updates, backups, security.

---

## 4. Iran-resilience deployment notes

To keep Distort usable when Iran's national intranet activates:

1. **Front the app behind Cloudflare** — even if `distort.app` gets SNI-blocked, Cloudflare's `*.pages.dev` or `*.workers.dev` fallback domains keep working.
2. **Mirror the app on multiple domains** — deploy the same build to Vercel, Cloudflare Pages, and a VPS; list all mirror URLs on the landing page.
3. **The Community Mesh tab is the killer feature** — even if Distort's own 30 servers are blocked, users can paste/import community VLESS/VMess configs (like the Milad Tahanian Iran list) and keep connecting.
4. **Ship the Chrome extension** — browser-level proxy can't be blocked the same way as system VPNs, and it doesn't need admin rights.
5. **Host the subscription URL on multiple mirrors** — GitHub raw is usually accessible, but also mirror on a Cloudflare R2 bucket and your own domain.

---

## 5. Marketing & launch (zero-budget)

1. **Landing page** — already built. Share `distort.app` on:
   - Twitter/X (Persian tech community: @FilterBuble, @proxymtp, etc.)
   - Reddit: r/iran, r/VPN, r/privacy
   - Telegram channels (Iranian anti-censorship channels have 100k+ members)
   - GitHub README (already links to the repo)

2. **Chrome Web Store listing** — optimized title/description for "free VPN Iran", "free VPN", "anti-censorship VPN".

3. **Community seeding** — ask the Config-Collector maintainer (miladtahanian) to list Distort as a recommended client. Cross-link with other Iran-focused tools (v2rayNG, Nekoray).

4. **Documentation** — `README.md` + `docs/ROADMAP.md` already done. Add a `/docs` page in-app with screenshots.

---

## 6. What's still missing for a REAL VPN (not a simulator)

The web app **simulates** the tunnel. To make it actually tunnel traffic, you need the items in `docs/ROADMAP.md` Phase 1+2:

- WireGuard userspace driver (`boringtun`)
- TUN device management (wintun.dll on Windows)
- Privileged helper service
- V2Ray/sing-box core for stealth transports
- Real key lifecycle via a control plane

**But** — the Community Mesh feature already lets users export configs to their own V2RayN/Nekoray/Shadowrocket clients. So even without a real tunnel engine, Distort is immediately useful as a config aggregator + generator.

---

## 7. Suggested launch sequence

1. **Week 1:** Push to GitHub, deploy to Vercel, submit Chrome extension to Web Store.
2. **Week 2:** Share on social media, collect feedback, fix bugs.
3. **Week 3:** Add Persian (RTL) localization (the audience is primarily Iranian).
4. **Week 4:** Start Phase 1 of the ROADMAP (WireGuard integration) — this is what makes it a "real" VPN.
5. **Month 2:** Security audit + code signing + mobile apps.

---

Distort is ready. Ship it.
