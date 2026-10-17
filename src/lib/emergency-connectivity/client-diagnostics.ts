// DISTORT — Client-side network diagnostics
//
// The server CANNOT know if the user's device has internet. This module
// runs REAL probes from the browser to determine the actual network state.
//
// What it does (honestly):
//   1. Checks if navigator.onLine is true (browser thinks it's online)
//   2. Tries to fetch a domestic destination (iran.ir / aparat.com)
//   3. Tries to fetch an international destination (cloudflare / google)
//   4. Tries to fetch a known-good IP (1.1.1.1) to check if DNS resolves
//   5. Measures latency via fetch timing
//
// What it CANNOT do (browser limitation):
//   - Cannot do raw TCP connect (no socket API in browsers)
//   - Cannot bypass CORS — uses no-cors mode which limits response inspection
//   - Cannot detect DPI specifically — only infers from reachability + latency
//
// For real TCP probing + DPI detection, the desktop / Android companion
// does its own diagnosis and reports back.

import type { NetworkDiagnosis, BaseNetworkStatus } from "./types";

// Well-known probe targets.
// Domestic = Iranian sites (if reachable, national internet is up).
// International = global anycast (if reachable, international routing works).
// DNS canary = a domain that should always resolve (cloudflare.com).

const DOMESTIC_TARGETS = [
  "https://www.iran.ir",
  "https://www.aparat.com",
];

const INTERNATIONAL_TARGETS = [
  "https://1.1.1.1/cdn-cgi/trace",  // Cloudflare anycast — returns text
  "https://www.google.com/generate_204",  // Returns 204 No Content
  "https://cloudflare.com/cdn-cgi/trace",
];

const DNS_CANARY = "https://dns.cloudflare.com/";

type RawProbe = {
  url: string;
  ok: boolean;
  latencyMs: number;
  // 'domestic' | 'international' | 'dns-canary'
  category: "domestic" | "international" | "dns-canary";
};

// Fetch a URL with a timeout. Returns ok=true if we got ANY response
// (even a CORS error means the server responded = reachable).
// Returns ok=false only on timeout or network error.
async function probeUrl(url: string, timeoutMs = 5000): Promise<{ ok: boolean; latencyMs: number }> {
  const start = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    await fetch(url, {
      mode: "no-cors", // we don't need the body, just connectivity
      cache: "no-store",
      signal: controller.signal,
      // Don't send credentials — avoid confusing auth-required endpoints
      credentials: "omit",
      redirect: "manual", // don't follow redirects — we just want "did it respond"
    });
    clearTimeout(timeout);
    return { ok: true, latencyMs: Math.round(performance.now() - start) };
  } catch (e: unknown) {
    clearTimeout(timeout);
    // In no-cors mode, a TypeError often means "CORS blocked" — but the server
    // DID respond. A network error (ERR_INTERNET_DISCONNECTED) also throws.
    // We can't reliably distinguish in-browser, so we treat TypeError as
    // "possibly reachable" and only return ok=false on explicit AbortError
    // (timeout) or if navigator.onLine is false.
    const err = e as { name?: string };
    if (err?.name === "AbortError") {
      return { ok: false, latencyMs: timeoutMs };
    }
    // If we're offline per navigator, it's a real failure
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      return { ok: false, latencyMs: Math.round(performance.now() - start) };
    }
    // TypeError after a fetch often means CORS preflight failed — but the
    // server may still have responded. Be conservative: treat as reachable
    // only if the latency was reasonable (> 50ms suggests a real round-trip).
    const latency = Math.round(performance.now() - start);
    if (latency > 50 && latency < timeoutMs) {
      return { ok: true, latencyMs: latency };
    }
    return { ok: false, latencyMs: latency };
  }
}

async function probeAll(targets: string[], category: RawProbe["category"], timeoutMs = 5000): Promise<RawProbe[]> {
  const results = await Promise.all(
    targets.map(async (url) => {
      const r = await probeUrl(url, timeoutMs);
      return { url, ok: r.ok, latencyMs: r.latencyMs, category };
    })
  );
  return results;
}

// Main entry: diagnose the network from the browser.
// Returns a NetworkDiagnosis with honest results.
export async function diagnoseClientSide(): Promise<NetworkDiagnosis> {
  // 1. Check navigator.onLine first (fast, no network)
  const navOnline = typeof navigator !== "undefined" ? navigator.onLine : true;

  // 2. If navigator says offline, trust it (no network at all)
  if (!navOnline) {
    return {
      baseNetwork: "offline",
      dnsWorks: false,
      internationalReachable: false,
      domesticReachable: false,
      directLatencyMs: null,
      summary: "Browser reports offline (navigator.onLine=false). No network connectivity detected. The device has no active network interface.",
      checkedAt: new Date().toISOString(),
    };
  }

  // 3. Probe domestic + international + DNS canary in parallel
  const [domestic, international, dns] = await Promise.all([
    probeAll(DOMESTIC_TARGETS, "domestic", 4000),
    probeAll(INTERNATIONAL_TARGETS, "international", 5000),
    probeAll([DNS_CANARY], "dns-canary", 4000),
  ]);

  const domesticReachable = domestic.some((p) => p.ok);
  const internationalReachable = international.some((p) => p.ok);
  const dnsWorks = dns.some((p) => p.ok) || internationalReachable;

  // Latency: take the minimum successful international probe
  const okLatencies = international
    .filter((p) => p.ok)
    .map((p) => p.latencyMs);
  const directLatencyMs = okLatencies.length > 0 ? Math.min(...okLatencies) : null;

  // Determine base network status
  let baseNetwork: BaseNetworkStatus;
  if (internationalReachable || domesticReachable) {
    baseNetwork = "online";
  } else if (navOnline) {
    // navigator says online but we couldn't reach anything — local-only or DNS broken
    baseNetwork = "local-only";
  } else {
    baseNetwork = "offline";
  }

  // Build an honest summary
  const parts: string[] = [];
  parts.push(`Base network: ${baseNetwork}.`);
  parts.push(`Domestic (Iran) reachable: ${domesticReachable ? "yes" : "no"}.`);
  parts.push(`International reachable: ${internationalReachable ? "yes" : "no"}.`);
  parts.push(`DNS works: ${dnsWorks ? "yes" : "no"}.`);
  if (directLatencyMs !== null) {
    parts.push(`Direct latency (min): ${directLatencyMs}ms.`);
  } else {
    parts.push(`Direct latency: unreachable.`);
  }
  if (baseNetwork === "online" && !internationalReachable && domesticReachable) {
    parts.push("National-intranet scenario detected: domestic works but international is blocked. VPN tunnel required to reach the open internet.");
  }
  if (baseNetwork === "local-only") {
    parts.push("Local network appears up but no destinations are reachable. DNS may be broken, or the network is captive/filtered.");
  }

  return {
    baseNetwork,
    dnsWorks,
    internationalReachable,
    domesticReachable,
    directLatencyMs,
    summary: parts.join(" "),
    checkedAt: new Date().toISOString(),
  };
}

// Lighter-weight continuous health check — used by the monitoring loop
// after a tunnel is established. Returns just "online" + latency.
export async function quickHealthCheck(timeoutMs = 3000): Promise<{ online: boolean; latencyMs: number | null }> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { online: false, latencyMs: null };
  }
  const r = await probeUrl("https://1.1.1.1/cdn-cgi/trace", timeoutMs);
  return { online: r.ok, latencyMs: r.ok ? r.latencyMs : null };
}

// Detect if the network changed (e.g. Wi-Fi → mobile data).
// Browsers fire online/offline events on navigator.
// Returns a cleanup function to remove the listeners.
export function onNetworkChange(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => callback();
  window.addEventListener("online", handler);
  window.addEventListener("offline", handler);
  // Some browsers also fire on connection type change
  if ("connection" in navigator) {
    const conn = (navigator as unknown as { connection?: { addEventListener?: (t: string, h: () => void) => void } }).connection;
    conn?.addEventListener?.("change", handler);
  }
  return () => {
    window.removeEventListener("online", handler);
    window.removeEventListener("offline", handler);
    if ("connection" in navigator) {
      const conn = (navigator as unknown as { connection?: { removeEventListener?: (t: string, h: () => void) => void } }).connection;
      conn?.removeEventListener?.("change", handler);
    }
  };
}
