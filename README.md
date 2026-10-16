# DISTORT

**Freedom Beyond Borders** — an open-source privacy and connectivity project.

> Project status: **early scaffold / not a working VPN yet**. The current repository contains Windows launcher scripts and setup notes, but not the application source, VPN tunnel implementation, server infrastructure, or a Chrome extension.

## Goals

- Modern desktop VPN client with a clear connection state and privacy-first defaults.
- Chrome extension for browser proxying, with explicit permissions and clear limitations.
- Open, auditable networking components and reproducible builds.
- Resilience under network disruption, without promising that any tool can always bypass a nationwide shutdown.
- Free for users where possible, with transparent infrastructure costs and no hidden data monetization.

## Repository status

See [docs/ROADMAP.md](docs/ROADMAP.md) for the architecture, gap analysis, security checklist, and phased plan.

## Current Windows launcher

The existing `start.bat` expects a Node.js project and runs `npm run dev`; `build-exe.bat` expects a Next.js/Electron/Prisma project. The source files and package manifests needed to make those commands work are not currently present in this repository.

## Security note

Do not commit real credentials, private keys, access tokens, server credentials, or personal data. Keep local environment files out of Git and commit only a sanitized `.env.example`. If a secret was ever committed, revoke/rotate it; deleting it in a later commit does not erase it from Git history.

## Development principles

- Never claim the VPN is connected unless the tunnel has actually been established and verified.
- Fail closed when configured to prevent leaks; make the behavior visible to the user.
- Do not collect browsing history or DNS logs by default.
- Publish threat model, privacy policy, supported platforms, and known limitations before public release.
- Use independently reviewed, maintained VPN protocols rather than inventing cryptography.

## License

No license is currently specified. Until a license is added, others do not automatically have permission to reuse, modify, or redistribute this code. Choose a license deliberately before inviting contributions.
