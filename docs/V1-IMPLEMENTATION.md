# DISTORT v0.1 foundation — Windows + Chrome

## Selected scope
- First desktop platform: Windows.
- Desktop and Chrome extension foundations developed in parallel.
- Intended sustainability: open-source clients and community donations/sponsorship; costs and limitations will be disclosed.
- No VPN service, endpoint fleet, or unlimited free bandwidth is claimed to exist.

## Implemented in this branch
- Electron desktop shell with context isolation, sandboxing, Node integration disabled in renderer, and restrictive Content Security Policy.
- Dashboard explicitly reports that the VPN engine is not configured and traffic is not being tunneled.
- Chrome Manifest V3 extension popup with minimal storage permission and no proxy or host permissions.
- Extension explicitly states that it does not change browser traffic or IP address.
- Root npm workspace, Windows NSIS packaging script, basic tests, CI, contribution guidance, security guidance, and MIT license.

## Not implemented
- VPN tunnel engine or Windows service/TUN driver.
- WireGuard integration, key provisioning, DNS routing, IPv4/IPv6 leak prevention, or kill switch.
- Chrome proxy integration, trusted proxy configuration, authentication, or browser tunnel.
- Community endpoints, control-plane API, health monitoring, server deployment, or donation system.
- Signed production installer, code signing certificate, release pipeline, or independent security audit.

## Next engineering steps
1. Select and document the Windows tunnel integration strategy and licensing/platform constraints.
2. Implement a least-privilege tunnel lifecycle service and verify connected state against the real engine.
3. Define trusted endpoint provisioning and key rotation; do not embed shared private keys in the client.
4. For the extension, choose a local desktop bridge or separately operated authenticated proxy. Request proxy/host permissions only when implemented.
5. Add integration tests for public IP, DNS, IPv6, disconnect, reconnect, sleep/resume, and network changes.
6. Provision a small community-operated test endpoint, document its operator and privacy policy, and measure bandwidth costs before beta.
7. Review installer signing, update trust, privacy disclosures, and incident response before public release.

## Running the preview
Install Node.js 20.11 or newer, then run:

    npm install
    npm start

To load the extension, open chrome://extensions, enable Developer mode, choose Load unpacked, and select apps/extension.

To build the Windows installer on Windows:

    npm install
    npm run dist:win

The installer output is written to release/. Packaging has not yet been verified on a Windows runner. This preview does not protect traffic.
