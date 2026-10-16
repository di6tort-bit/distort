// DISTORT — anti-censorship utilities
// Helpers for the "stay online when the internet goes dark" mandate.

export type AntiCensorStatus = {
  level: "safe" | "degraded" | "hostile";
  label: string;
  description: string;
  recommendedProtocol: string;
  recommendedStealth: boolean;
  color: string;
};

// A heuristic snapshot of the local network climate. In a real client this
// would be measured by active probing (RST rates, TLS handshake success, etc.)
export function assessNetworkClimate(ping: number, stealthAvailable: boolean): AntiCensorStatus {
  // If latency is wildly inconsistent / high, assume DPI interference.
  if (ping > 250 || ping === 0) {
    return {
      level: "hostile",
      label: "Hostile — National filtering detected",
      description:
        "Active DPI / SNI blocking observed. Distort will switch to obfuscated transports (Trojan / VMess-WS-TLS) and rotate entry nodes automatically.",
      recommendedProtocol: "trojan",
      recommendedStealth: true,
      color: "#ff4d6d",
    };
  }
  if (ping > 120) {
    return {
      level: "degraded",
      label: "Degraded — Possible throttling",
      description:
        "Latency is elevated. Distort will prefer V2Ray/WS+TLS and keep WireGuard as a fallback. Obfuscation recommended.",
      recommendedProtocol: "v2ray",
      recommendedStealth: true,
      color: "#ffb020",
    };
  }
  return {
    level: "safe",
    label: "Safe — Open internet",
    description:
      "Network is healthy. WireGuard will give you the best speed. Stealth mode can stay on for privacy.",
    recommendedProtocol: "wireguard",
    recommendedStealth: stealthAvailable,
    color: "#10d9a0",
  };
}

// Auto-pick the best server for the user. Prefers stealth + low ping + low load.
export function pickAutoServer<T extends { ping: number; load: number; online: boolean; stealth: boolean; premium: boolean }>(
  servers: T[],
  opts: { stealth: boolean; allowPremium: boolean }
): T | undefined {
  const pool = servers.filter(
    (s) => s.online && (opts.allowPremium || !s.premium) && (!opts.stealth || s.stealth)
  );
  if (!pool.length) return servers.find((s) => s.online);
  return pool.sort((a, b) => {
    const sa = a.ping + a.load * 1.5 + (a.stealth ? 0 : 40);
    const sb = b.ping + b.load * 1.5 + (b.stealth ? 0 : 40);
    return sa - sb;
  })[0];
}

// Simulated reachability check (real client would do TCP connect + TLS handshake).
export function probeReachability(host: string, port: number): Promise<{ ok: boolean; latencyMs: number }> {
  return new Promise((resolve) => {
    const start = Date.now();
    const t = setTimeout(() => resolve({ ok: false, latencyMs: Date.now() - start }), 1200);
    // We can't open raw TCP from the browser, so simulate based on host hash.
    setImmediate(() => {
      clearTimeout(t);
      const h = host.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
      const ok = (h % 10) > 1; // ~80% reachable
      resolve({ ok, latencyMs: ok ? 18 + (h % 60) : 0 });
    });
  });
}
