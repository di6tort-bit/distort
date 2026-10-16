# Contributing to DISTORT

DISTORT is an early-stage open-source connectivity project. Contributions are welcome, but do not describe mock UI or untested networking code as a working VPN.

## Development principles
- Never commit credentials, private keys, access tokens, personal data, or local environment files.
- Use maintained, reviewed networking protocols and libraries; do not invent cryptography.
- Keep permissions minimal and explain every new browser or operating-system privilege.
- Do not collect browsing history or DNS logs by default.
- Any connection UI must reflect verified tunnel state, not optimistic assumptions.
- Include tests and clear reproduction steps.
- Be explicit about limitations and supported operating systems.

## Current state
The desktop app and Chrome extension are UI foundations only. No VPN engine, proxy endpoint, community server pool, kill switch, or traffic-leak protection is implemented.

## Proposing a change
1. Open an issue describing the problem and intended behavior.
2. Keep changes focused and document security implications.
3. Run npm test and relevant platform-specific checks.
4. Never include live server credentials in issues, logs, or pull requests.
