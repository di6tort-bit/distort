// DISTORT — VPN config generator
// Generates ready-to-use configs for WireGuard, V2Ray (VMess), Trojan, Shadowsocks.
//
// IMPORTANT: For WireGuard, the keys here are demo placeholders (clearly marked).
// You MUST replace them with real keys issued by your VPN provider or your own
// WireGuard server. For V2Ray/Trojan/Shadowsocks, the UUID/password are also
// placeholders — use the REAL credentials from the Community Mesh tab.
//
// To get REAL configs with real credentials, use the Community Mesh tab in the
// dashboard — those configs are parsed from live Iran subscription URLs and
// contain actual server UUIDs, passwords, and Reality public keys.

export type Protocol = "wireguard" | "v2ray" | "trojan" | "shadowsocks" | "ssh";

type ServerLite = {
  code: string;
  country: string;
  city: string;
  host: string;
  port: number;
};

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

export function generateConfig(
  protocol: Protocol,
  server: ServerLite,
  userTag = "distort-free"
): { filename: string; mime: string; content: string } {
  const userKey = fakeKey(32);
  switch (protocol) {
    case "wireguard": {
      const privKey = fakeKey(44, "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/");
      const pubKey = fakeKey(44, "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/");
      const preshared = fakeKey(44, "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/");
      const content = `# DISTORT — WireGuard config
# Server: ${server.country} · ${server.city} (${server.code})
# Account: ${userTag}
# Generated: ${new Date().toISOString()}

[Interface]
PrivateKey = ${privKey}
Address = 10.66.${(userTag.charCodeAt(0) || 100) % 200}.2/32
Address = fd42:dead:beef::${(userTag.charCodeAt(1) || 100) % 9999}/128
DNS = 1.1.1.1, 9.9.9.9
MTU = 1420

[Peer]
PublicKey = ${pubKey}
PresharedKey = ${preshared}
AllowedIPs = 0.0.0.0/0, ::/0
Endpoint = ${server.host}:${server.port}
PersistentKeepalive = 25
`;
      return { filename: `distort-${server.code}.conf`, mime: "text/plain", content };
    }
    case "v2ray": {
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
      return { filename: `distort-${server.code}-v2ray.json`, mime: "application/json", content: JSON.stringify(obj, null, 2) };
    }
    case "trojan": {
      const content = `# DISTORT — Trojan config
# Server: ${server.country} · ${server.city} (${server.code})
# Account: ${userTag}

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
      return { filename: `distort-${server.code}-trojan.json`, mime: "application/json", content };
    }
    case "shadowsocks": {
      const userpass = fakeKey(16);
      const content = `# DISTORT — Shadowsocks
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
      return { filename: `distort-${server.code}-shadowsocks.json`, mime: "application/json", content };
    }
    case "ssh": {
      const content = `# DISTORT — SSH fallback tunnel
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
      return { filename: `distort-${server.code}-ssh.conf`, mime: "text/plain", content };
    }
    default:
      return { filename: "distort.txt", mime: "text/plain", content: "Unknown protocol" };
  }
}

export function summarizeConfig(content: string): string {
  return content.split("\n").slice(0, 8).join("\n") + "\n...";
}
