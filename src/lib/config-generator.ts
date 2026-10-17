// DISTORT — config generator
//
// TWO SEPARATE PATHS — do not mix them:
//
// 1. Template / Preview configs (exported as `generateTemplateConfig*`):
//    - For DISPLAY and EDUCATION only
//    - Uses SAMPLE/FAKE credentials (clearly marked)
//    - CANNOT be used to connect — will fail
//    - Must be labeled with `connectable: false`
//
// 2. Provisioned configs (exported as `provisionConfig*`):
//    - Issued from REAL infrastructure with real credentials
//    - CAN be used to connect
//    - Labeled with `connectable: true`
//    - For now, provisioning is a STUB — returns null with a clear error
//      because the provisioning infrastructure doesn't exist yet
//
// BACKWARD COMPAT: the original `generateConfig()` and `summarizeConfig()`
// exports are preserved as thin wrappers over the new template path, so the
// existing /api/servers/[id]/config route keeps working unchanged.

export type Protocol = "wireguard" | "v2ray" | "trojan" | "shadowsocks" | "ssh";

// The unified shape returned by BOTH paths. The `connectable` flag is the
// CRITICAL field that distinguishes templates from provisioned configs —
// never let a template slip through with `connectable: true`.
export type GeneratedConfig = {
  // CRITICAL: this flag distinguishes templates from provisioned configs
  connectable: boolean;
  // The protocol
  protocol: Protocol;
  // The config text (WireGuard conf, v2ray JSON, trojan ss uri, etc.)
  content: string;
  // Human-readable label
  label: string;
  // Source: 'template' | 'provisioned' | 'imported'
  source: "template" | "provisioned" | "imported";
  // Warning shown to user (for templates: "NOT CONNECTABLE — sample credentials")
  warning: string | null;
  // Country (if known)
  country?: string;
  // Expiry (for provisioned configs only)
  expiresAt?: string;
};

// STUB provisioning result. See `provisionConfig` below.
export type ProvisionResult = {
  ok: boolean;
  config: GeneratedConfig | null;
  error: string | null;
};

type ServerLite = {
  code: string;
  country: string;
  city: string;
  host: string;
  port: number;
};

// The warning every template config carries. Centralized so it can never drift
// out of sync with the UI's "NOT CONNECTABLE" labelling.
export const TEMPLATE_WARNING =
  "NOT CONNECTABLE — uses sample credentials. For a real connection, use a provisioned config from the Community Mesh or your own server.";

// Deterministic-ish placeholder key generator (NOT cryptographically secure — demo only).
function fakeKey(len: number, alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789") {
  let out = "";
  // simple LCG seeded by code char codes so the same server always yields the same demo key
  let seed = 0;
  for (const ch of "distort") seed = (seed * 31 + ch.charCodeAt(0)) % 2147483647;
  for (let i = 0; i < len; i++) {
    seed = (seed * 1103515245 + 12345) % 2147483647;
    out += alphabet[(seed >> 8) % alphabet.length];
  }
  return out;
}

function base64(s: string) {
  return Buffer.from(s, "utf-8").toString("base64");
}

function base64Url(s: string) {
  return base64(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// ---------------------------------------------------------------------------
// PATH 1 — TEMPLATE / PREVIEW configs
// ---------------------------------------------------------------------------
//
// Every `generateTemplate*` function returns a GeneratedConfig with:
//   connectable: false
//   source: "template"
//   warning: TEMPLATE_WARNING
//
// The content contains FAKE keys, UUIDs, and passwords — it will NOT connect.

export function generateTemplateWireGuard(server: ServerLite): GeneratedConfig {
  const privKey = fakeKey(44, "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/");
  const pubKey = fakeKey(44, "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/");
  const preshared = fakeKey(44, "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/");
  const content = `# ⚠️ PLACEHOLDER — NOT FOR PRODUCTION USE
# This config contains FAKE keys. It will NOT connect.
# For real configs, use the Community Mesh tab or request a provisioned config.
# DISTORT — WireGuard config
# Server: ${server.country} · ${server.city} (${server.code})
# Generated: ${new Date().toISOString()}

[Interface]
PrivateKey = ${privKey}
Address = 10.66.2.2/32
Address = fd42:dead:beef::2/128
DNS = 1.1.1.1, 9.9.9.9
MTU = 1420

[Peer]
PublicKey = ${pubKey}
PresharedKey = ${preshared}
AllowedIPs = 0.0.0.0/0, ::/0
Endpoint = ${server.host}:${server.port}
PersistentKeepalive = 25
`;
  return {
    connectable: false,
    protocol: "wireguard",
    content,
    label: `WireGuard template · ${server.country} (${server.code})`,
    source: "template",
    warning: TEMPLATE_WARNING,
    country: server.country,
  };
}

export function generateTemplateV2Ray(server: ServerLite): GeneratedConfig {
  const id = `${fakeKey(8)}-${fakeKey(4)}-${fakeKey(4)}-${fakeKey(4)}-${fakeKey(12)}`.toLowerCase();
  const obj = {
    log: { loglevel: "warning" },
    inbounds: [
      {
        tag: "socks-in",
        port: 10808,
        listen: "127.0.0.1",
        protocol: "socks",
        settings: { auth: "noauth", udp: true },
      },
      {
        tag: "http-in",
        port: 10809,
        listen: "127.0.0.1",
        protocol: "http",
      },
    ],
    outbounds: [
      {
        tag: "distort-out",
        protocol: "vmess",
        settings: { vnext: [{ address: server.host, port: server.port, users: [{ id, alterId: 0, security: "auto" }] }] },
        streamSettings: {
          network: "ws",
          security: "tls",
          tlsSettings: { serverName: server.host, allowInsecure: false },
          wsSettings: { path: "/distort", headers: { Host: server.host } },
        },
        mux: { enabled: true, concurrency: 8 },
      },
    ],
    routing: {
      domainStrategy: "IPIfNonMatch",
      rules: [
        { type: "field", ip: ["geoip:private"], outboundTag: "direct" },
        { type: "field", domain: ["geosite:category-ads-all"], outboundTag: "block" },
      ],
    },
  };
  const content =
    `// ⚠️ PLACEHOLDER — NOT FOR PRODUCTION USE\n` +
    `// This config contains a FAKE UUID. It will NOT connect.\n` +
    `// For real configs, use the Community Mesh tab or request a provisioned config.\n` +
    `// DISTORT — V2Ray (VMess) config · Server: ${server.country} · ${server.city} (${server.code})\n` +
    JSON.stringify(obj, null, 2);
  return {
    connectable: false,
    protocol: "v2ray",
    content,
    label: `V2Ray template · ${server.country} (${server.code})`,
    source: "template",
    warning: TEMPLATE_WARNING,
    country: server.country,
  };
}

export function generateTemplateTrojan(server: ServerLite): GeneratedConfig {
  const userKey = fakeKey(32);
  const content = `# ⚠️ PLACEHOLDER — NOT FOR PRODUCTION USE
# This config contains a FAKE password. It will NOT connect.
# For real configs, use the Community Mesh tab or request a provisioned config.
# DISTORT — Trojan config
# Server: ${server.country} · ${server.city} (${server.code})

{
  "run_type": "client",
  "local_addr": "127.0.0.1",
  "local_port": 10808,
  "remote_addr": "${server.host}",
  "remote_port": ${server.port},
  "password": ["${userKey}"],
  "log_level": 2,
  "ssl": {
    "verify": true,
    "verify_hostname": true,
    "cert": "",
    "cipher": "ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256",
    "sni": "${server.host}",
    "alpn": ["h2", "http/1.1"],
    "reuse_session": true,
    "session_ticket": false,
    "curves": ""
  },
  "tcp": {
    "no_delay": true,
    "keep_alive": true,
    "reuse_port": false,
    "fast_open": false,
    "fast_open_qlen": 20
  }
}
`;
  return {
    connectable: false,
    protocol: "trojan",
    content,
    label: `Trojan template · ${server.country} (${server.code})`,
    source: "template",
    warning: TEMPLATE_WARNING,
    country: server.country,
  };
}

export function generateTemplateShadowsocks(server: ServerLite): GeneratedConfig {
  const userpass = fakeKey(16);
  const content = `# ⚠️ PLACEHOLDER — NOT FOR PRODUCTION USE
# This config contains a FAKE password. It will NOT connect.
# For real configs, use the Community Mesh tab or request a provisioned config.
# DISTORT — Shadowsocks
# Server: ${server.country} · ${server.city} (${server.code})
# ss:// URI:  ss://${base64Url(`chacha20-ietf-poly1305:${userpass}`)}@${server.host}:${server.port}#DISTORT-${server.code}

server: ${server.host}
server_port: ${server.port}
method: chacha20-ietf-poly1305
password: ${userpass}
plugin: v2ray-plugin
plugin_opts: tls;host=${server.host};path=/distort
mode: tcp
fast_open: true
timeout: 60
`;
  return {
    connectable: false,
    protocol: "shadowsocks",
    content,
    label: `Shadowsocks template · ${server.country} (${server.code})`,
    source: "template",
    warning: TEMPLATE_WARNING,
    country: server.country,
  };
}

export function generateTemplateSSH(server: ServerLite): GeneratedConfig {
  const content = `# DISTORT — SSH fallback tunnel (TEMPLATE)
# Run on client:
#   ssh -C -D 1080 -N -p ${server.port} distort@${server.host}
# Then point your browser SOCKS5 to 127.0.0.1:1080
#
# Server: ${server.country} · ${server.city} (${server.code})
# Fingerprint: SHA256:${fakeKey(43, "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=")}
Host ${server.host}
  HostName ${server.host}
  Port ${server.port}
  User distort
  DynamicForward 1080
  Compression yes
  ServerAliveInterval 25
  ServerAliveCountMax 3
  IdentitiesOnly yes
  # Use your issued private key:
  # IdentityFile ~/.ssh/distort_ed25519
`;
  return {
    connectable: false,
    protocol: "ssh",
    content,
    label: `SSH template · ${server.country} (${server.code})`,
    source: "template",
    warning: TEMPLATE_WARNING,
    country: server.country,
  };
}

// Generic dispatcher. Picks the right per-protocol template generator.
export function generateTemplateConfig(
  protocol: Protocol,
  server: ServerLite
): GeneratedConfig {
  switch (protocol) {
    case "wireguard":
      return generateTemplateWireGuard(server);
    case "v2ray":
      return generateTemplateV2Ray(server);
    case "trojan":
      return generateTemplateTrojan(server);
    case "shadowsocks":
      return generateTemplateShadowsocks(server);
    case "ssh":
      return generateTemplateSSH(server);
  }
}

// ---------------------------------------------------------------------------
// PATH 2 — PROVISIONED configs (STUB)
// ---------------------------------------------------------------------------
//
// STUB — provisioning infrastructure not yet available.
// When real infrastructure is built, this will issue real configs with real
// credentials from the Distort server fleet (e.g. signed by a per-user
// provisioning server, with a real WireGuard peer registered on the box,
// real VMess UUID allocated by the v2ray backend, etc.).
//
// For now, all provisionConfig* functions return null with a clear error so
// the user is NEVER handed a config that looks ready but won't connect.

export async function provisionConfig(opts: {
  protocol: Protocol;
  userEmail: string;
  preferredCountry?: string;
}): Promise<ProvisionResult> {
  // Check if user is VIP/admin
  // (this would call the DB — for now, just return an error)
  void opts; // opts intentionally accepted for forward-compat; not used by the stub.
  return {
    ok: false,
    config: null,
    error:
      "Provisioning infrastructure not yet available. Use the Community Mesh tab to import real configs from the Iran subscription, or paste your own config URI.",
  };
}

// ---------------------------------------------------------------------------
// BACKWARD COMPAT shim
// ---------------------------------------------------------------------------
//
// The original `generateConfig()` returned `{ filename, mime, content }` and
// was consumed by /api/servers/[id]/config. We keep that exact shape and
// derive filename/mime from the protocol, while internally routing through
// the new template path. This means existing API consumers continue to work
// without any change.

function legacyMimeAndFilename(protocol: Protocol, server: ServerLite): { filename: string; mime: string } {
  switch (protocol) {
    case "wireguard":
      return { filename: `distort-${server.code}.conf`, mime: "text/plain" };
    case "v2ray":
      return { filename: `distort-${server.code}-v2ray.json`, mime: "application/json" };
    case "trojan":
      return { filename: `distort-${server.code}-trojan.json`, mime: "application/json" };
    case "shadowsocks":
      return { filename: `distort-${server.code}-shadowsocks.json`, mime: "application/json" };
    case "ssh":
      return { filename: `distort-${server.code}-ssh.conf`, mime: "text/plain" };
  }
}

export function generateConfig(
  protocol: Protocol,
  server: ServerLite,
  _userTag = "distort-free"
): { filename: string; mime: string; content: string } {
  const tpl = generateTemplateConfig(protocol, server);
  const { filename, mime } = legacyMimeAndFilename(protocol, server);
  return { filename, mime, content: tpl.content };
}

export function summarizeConfig(content: string): string {
  return content.split("\n").slice(0, 8).join("\n") + "\n...";
}
