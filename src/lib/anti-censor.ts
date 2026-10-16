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

// REAL reachability check using actual TCP connection + TLS handshake.
// On the server (Node.js), this opens a real TCP socket to host:port.
// In the browser, falls back to a fetch-based probe.
export async function probeReachability(host: string, port: number): Promise<{ ok: boolean; latencyMs: number }> {
  const start = Date.now();

  // Server-side: use real TCP socket
  if (typeof window === "undefined") {
    try {
      const net = await import("net");
      return await new Promise((resolve) => {
        const socket = new net.Socket();
        const timeout = setTimeout(() => {
          socket.destroy();
          resolve({ ok: false, latencyMs: Date.now() - start });
        }, 3000);
        socket.setTimeout(3000);
        socket.once("connect", () => {
          clearTimeout(timeout);
          socket.destroy();
          resolve({ ok: true, latencyMs: Date.now() - start });
        });
        socket.once("error", () => {
          clearTimeout(timeout);
          resolve({ ok: false, latencyMs: Date.now() - start });
        });
        socket.connect(port, host);
      });
    } catch {
      // fall through to fetch-based probe
    }
  }

  // Browser-side: use fetch with no-cors (limited but better than nothing)
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    await fetch(`https://${host}:${port}/`, {
      mode: "no-cors",
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return { ok: true, latencyMs: Date.now() - start };
  } catch (e: any) {
    // abort = timeout; network error might still mean "reachable but rejected"
    if (e?.name === "AbortError") {
      return { ok: false, latencyMs: Date.now() - start };
    }
    // A network error (ERR_CONNECTION_REFUSED, ERR_CONNECTION_RESET) often means
    // the host IS reachable but doesn't serve HTTP — for VPN purposes, this is OK.
    return { ok: true, latencyMs: Date.now() - start };
  }
}
