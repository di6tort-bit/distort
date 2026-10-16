# DISTORT — Technical Gap Analysis & Roadmap

Updated: 2026-10-16

## 1. Current repository audit

At the initial audit, the default branch contained seven paths, including a tracked `.env`. The follow-up documentation/security commits added `README.md`, this roadmap, and `.env.example`, and removed `.env`. The current tree contains these paths:

- `.env.example`
- `.gitignore`
- `INSTALL.txt`
- `README.md`
- `build-exe.bat`
- `start.bat`
- `stop.bat`
- `download/README.md`
- `docs/ROADMAP.md`

The repository metadata identifies Batchfile as its language, has no declared license, and is very small. The checked-in launcher scripts refer to a Node/Next.js/Electron/Prisma application, but the corresponding `package.json`, lockfile, app source, Prisma schema, Electron main process, tests, and extension files are absent from the visible tree.

### Immediate blockers

1. **No application source or dependency manifest.** The launch/build scripts cannot produce the described app from the current checkout.
2. **No actual VPN tunnel.** No client tunnel integration, protocol configuration, server provisioning, authentication, key lifecycle, DNS routing, kill switch, or leak testing is present in the tree.
3. **No Chrome extension.** No Manifest V3 manifest, popup/options UI, service worker, proxy integration, permission rationale, or extension packaging exists.
4. **No deployable backend/control plane.** No API, server inventory, health checks, deployment configuration, abuse controls, or operational runbooks are present.
5. **No quality/security automation.** No tests, CI workflow, dependency scanning, secret scanning, code signing, release pipeline, or reproducible build instructions are present.
6. **No product/legal basics.** No explicit license, privacy policy, threat model, support policy, or realistic cost/sustainability plan is present.
7. **Environment file cleanup.** The initial `.env` contained a machine-specific database path and was removed from the current tree; a sanitized `.env.example` now documents the local setting, and `.gitignore` excludes local env files. This does not erase the old file from Git history. If real secrets were ever committed, rotate them and consider history cleanup.
8. **Launcher mismatch.** `start.bat` runs `npm run dev`, opens localhost after a fixed delay, and initializes Prisma only if a local database file is absent. `build-exe.bat` assumes Next.js standalone output, a Prisma schema, and Electron Builder configuration. None of those prerequisites are currently committed. The fixed delay also does not prove that the app is ready.
9. **Misleading seed message.** The launcher says 30 VPN servers are seeded, but a server list in a database would not itself create functioning or authorized VPN endpoints.
10. **Stop script risk.** `stop.bat` force-kills any process listening on port 3000, which could terminate an unrelated application.

This is a repository-level review of the current default-branch tree and all seven visible files, not a claim that absent files were tested locally.

## 2. Recommended architecture

Keep the product in a monorepo with explicit boundaries:

- `apps/desktop/`: native desktop UI and platform-specific tunnel lifecycle.
- `apps/extension/`: Chrome Manifest V3 extension; browser traffic only unless the user separately installs/configures a desktop tunnel.
- `apps/web/`: public site, documentation, downloads, status, and privacy disclosures.
- `services/control-plane/`: minimal API for signed configuration, server health, and version metadata; do not route user traffic through this API.
- `infra/`: deployment templates, server hardening, monitoring, and documented bootstrap procedures.
- `packages/shared/`: shared types, validation, localization, and protocol-independent UI models.
- `docs/`: threat model, architecture decisions, privacy policy draft, incident response, and release checklist.
- `.github/workflows/`: CI, tests, dependency/secret scanning, and release automation.

Select a mature, audited protocol and implementation (for example WireGuard where platform and network conditions permit). Evaluate other maintained transports for restrictive networks only after a written threat model and controlled testing. Do not implement custom cryptography. A browser extension's proxy capability is not equivalent to a system-wide VPN and may not carry all device traffic.

## 3. Connectivity during nationwide or severe shutdowns

No VPN can guarantee connectivity when the underlying network has no usable path to any reachable endpoint. A robust product can improve the odds when some paths remain available, but must not promise to defeat a complete shutdown.

Design considerations:
- Separate the control plane from data-plane connectivity; cache signed, expiring configurations so an already-installed client does not need the control API for every connection.
- Support more than one independently operated endpoint and more than one transport where justified, with health checks and safe fallback.
- Make bootstrap, endpoint discovery, DNS, time validation, and update delivery explicit dependencies; document what fails when each is blocked.
- Use signed configuration/update metadata, short-lived credentials where practical, revocation, and key rotation.
- Test on lawful, controlled networks with packet loss, DNS failure, endpoint blocking, IPv4/IPv6 differences, MTU issues, and captive portals.
- Avoid hard-coded public relay lists that can be abused, and never expose private server keys in the client or repository.
- Publish a realistic limitations statement. A Chrome extension cannot restore access if Chrome itself cannot reach any usable network path.

## 4. Free-to-user sustainability

“Free” for users is a product choice; servers, bandwidth, domains, signing, and incident response still cost money. Free tiers of cloud providers are limited and can change. Avoid promising unlimited free service before measuring traffic and operating costs.

Possible model:
- Open-source client and extension.
- Community-operated relays with clear operator responsibilities and abuse handling.
- Donations or grants, plus transparent sponsorship.
- Strict fair-use limits if needed; disclose them before connection.
- No selling browsing history, injecting ads, or silently turning users into relay nodes.
- Never use an untrusted public proxy as a default without clear risk disclosure.

## 5. Phased delivery plan

### Phase 0 — Repository integrity
- [x] Add this audit and a root README.
- [x] Remove tracked `.env` from the current tree; add `.env.example` and ignore local secrets.
- [ ] Add a license and contribution/security reporting guidance.
- [ ] Decide supported platforms and threat model.
- [ ] Replace claims in install docs that imply a functioning VPN/server pool before they are verified.

### Phase 1 — Buildable application foundation
- [ ] Add real package manifests, lockfile, app source, TypeScript/lint/test configuration, and pinned supported runtime versions.
- [ ] Build a polished responsive UI with connection states driven by actual tunnel status, not a mock toggle.
- [ ] Add local settings, accessible keyboard navigation, localization (including Persian RTL), error states, and telemetry disabled by default.
- [ ] Add CI that installs from lockfile, lints, type-checks, tests, and builds from a clean checkout.

### Phase 2 — VPN engine and security
- [ ] Integrate a maintained VPN implementation for each supported OS.
- [ ] Implement least-privilege service boundaries, secure key storage, signed configs, rotation/revocation, and secure update verification.
- [ ] Implement DNS handling, IPv4/IPv6 leak prevention, reconnect logic, kill switch policy, and clear failure behavior.
- [ ] Add automated tests for route/DNS leaks, disconnect behavior, suspend/resume, network changes, and malformed configs.
- [ ] Obtain independent security review before making strong privacy claims.

### Phase 3 — Chrome extension
- [ ] Create Manifest V3 extension with the minimum permissions.
- [ ] Provide popup UI, explicit connect/disconnect state, proxy configuration, error handling, and privacy disclosures.
- [ ] Define how the extension obtains trusted configuration and authenticates without shipping shared secrets.
- [ ] Document browser-only scope, WebRTC/DNS limitations, and interaction with the desktop app.
- [ ] Test extension packaging and Chrome Web Store policies; never claim system-wide protection.

### Phase 4 — Infrastructure and operations
- [ ] Provision and harden actual VPN endpoints; use unique keys per endpoint and a documented deployment process.
- [ ] Add authenticated administration, health monitoring, rate limits, abuse response, patching, and incident response.
- [ ] Collect the minimum operational logs needed; define retention and access controls publicly.
- [ ] Measure cost per active user and bandwidth before setting free-tier limits.
- [ ] Test recovery when one endpoint, DNS resolver, control API, or update host is unavailable.

### Phase 5 — Release readiness
- [ ] Publish privacy policy, threat model, limitations, license, support contact, and vulnerability disclosure policy.
- [ ] Add signed desktop releases, extension review package, checksums, SBOM, changelog, and rollback procedure.
- [ ] Run accessibility, performance, security, and clean-install tests on every supported platform.
- [ ] Release a clearly labelled beta first; avoid “100% secure”, “anonymous”, or shutdown-proof claims.

## 6. Definition of done

A release is not a working VPN until a real encrypted tunnel is established to a controlled endpoint and independently verified with route, public IP, DNS, IPv6, disconnect, and reconnect tests. UI mockups, seeded server records, or a packaged desktop window do not meet this criterion.

A release is not a working Chrome VPN until the extension actually routes the declared browser traffic through a tested, trusted proxy path and explains what it does not protect.

A release is not “free forever” until the operator has a credible, transparent plan to pay for bandwidth, servers, maintenance, and abuse handling.
