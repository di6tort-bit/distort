# Community config preflight

DISTORT can use a public config list as an **untrusted test source** while the project is looking for sponsored infrastructure. The first checker is intentionally a preflight filter, not a VPN engine.

## Run

With Node.js 20.11 or newer, from the repository root:

\`\`\`sh
npm run configs:check
\`\`\`

Optional arguments are a source URL and output file path:

\`\`\`sh
node tools/config-checker.cjs https://example.org/configs.txt reachable.txt
\`\`\`

The tool deduplicates lines, recognizes selected VLESS, VMess, Trojan, and Shadowsocks links, and tests whether their TCP endpoint accepts a connection. It writes reachable candidates to \`distort-reachable-configs.txt\` and a metadata report beside it. The report intentionally omits raw config strings because links can contain UUIDs, passwords, or other credentials.

## Important limits

- A successful TCP connection is **not** proof that authentication, TLS/Reality, WebSocket/gRPC, or the VPN tunnel works.
- A failed ICMP ping is not proof that a VPN endpoint is dead.
- UDP-based protocols are not validated by this TCP-only preflight.
- For a real latency/health check, DISTORT must launch a vetted compatible engine (for example, Xray for supported VLESS/VMess/Trojan transports), establish a local proxy/tunnel, and send a small test request through it. That integration is not included yet.
- Public configs are controlled by third parties and can be revoked, malicious, or unsafe. Do not send private traffic through them or treat them as trusted production infrastructure.
- The checker makes outbound connection attempts to the endpoints named in the source list. Use only lists you trust and keep concurrency modest.
