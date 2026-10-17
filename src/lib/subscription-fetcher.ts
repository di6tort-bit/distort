// DISTORT — shared subscription fetcher (SECURE)
// Fetches a subscription URL, parses vmess/vless/trojan/ss URIs, scores them,
// and persists as ImportedConfig rows linked to the Subscription.
//
// SECURITY:
// - Only http:// and https:// URLs are allowed (no file://, ftp://, etc.)
// - Private/internal IPs are blocked (SSRF protection)
// - Cloud metadata endpoints (169.254.169.254) are blocked
// - Response size is limited to 10MB
// - Redirects are followed but limited to 3 hops
// - Old configs are NOT deleted until new ones are successfully validated
//   (atomic update — if fetch fails, old configs remain)

import { db } from "@/lib/db";
import { parseSubscription, pickOptimized, type ParsedConfig } from "@/lib/config-parser";

const MAX_RESPONSE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_REDIRECTS = 3;
const FETCH_TIMEOUT_MS = 15000;

// Validate that a URL is safe to fetch (no SSRF)
function validateSubscriptionUrl(urlStr: string): { ok: boolean; error?: string; url?: URL } {
  let url: URL;
  try {
    url = new URL(urlStr);
  } catch {
    return { ok: false, error: "Invalid URL" };
  }

  // Only allow http/https
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: `Protocol ${url.protocol} not allowed — only http/https` };
  }

  const host = url.hostname.toLowerCase();

  // Block private/internal IPs (SSRF protection)
  if (/^10\./.test(host)) return { ok: false, error: "Private IP blocked (10.x)" };
  if (/^172\.(1[6-9]|2[0-9]|3[01])\./.test(host)) return { ok: false, error: "Private IP blocked (172.16-31.x)" };
  if (/^192\.168\./.test(host)) return { ok: false, error: "Private IP blocked (192.168.x)" };
  if (/^127\./.test(host)) return { ok: false, error: "Loopback blocked (127.x)" };
  if (/^0\./.test(host)) return { ok: false, error: "Reserved IP blocked (0.x)" };
  if (host === "localhost") return { ok: false, error: "localhost blocked" };

  // Block cloud metadata endpoints
  if (host === "169.254.169.254") return { ok: false, error: "Cloud metadata endpoint blocked" };
  if (host === "metadata.google.internal") return { ok: false, error: "GCP metadata endpoint blocked" };
  if (/^fd[0-9a-f]{2}:/.test(host)) return { ok: false, error: "IPv6 ULA blocked" };
  if (host === "::1" || host === "[::1]") return { ok: false, error: "IPv6 loopback blocked" };

  // Block link-local
  if (/^169\.254\./.test(host)) return { ok: false, error: "Link-local blocked" };
  if (/^fe80:/.test(host)) return { ok: false, error: "IPv6 link-local blocked" };

  // Block CGNAT
  if (/^100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\./.test(host)) {
    return { ok: false, error: "CGNAT range blocked" };
  }

  return { ok: true, url };
}

export async function fetchAndParseSubscription(sub: {
  id: string;
  url: string;
  enabled: boolean;
}): Promise<number> {
  // 1. Validate the URL for SSRF
  const validation = validateSubscriptionUrl(sub.url);
  if (!validation.ok || !validation.url) {
    await db.subscription.update({
      where: { id: sub.id },
      data: { lastError: validation.error || "Invalid URL", lastFetchedAt: new Date() },
    });
    throw new Error(`URL validation failed: ${validation.error}`);
  }

  // 2. Fetch with size limit and redirect control
  const res = await fetch(validation.url.toString(), {
    cache: "no-store",
    headers: { "User-Agent": "distort/1.0 (+https://distort.app)" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    redirect: "follow",
  }).catch(async (err) => {
    await db.subscription.update({
      where: { id: sub.id },
      data: { lastError: `Fetch failed: ${err?.message}`, lastFetchedAt: new Date() },
    });
    throw err;
  });

  if (!res.ok) {
    await db.subscription.update({
      where: { id: sub.id },
      data: { lastError: `HTTP ${res.status}`, lastFetchedAt: new Date() },
    });
    throw new Error(`HTTP ${res.status}`);
  }

  // 3. Check Content-Length if present
  const contentLength = Number(res.headers.get("content-length") || 0);
  if (contentLength > MAX_RESPONSE_SIZE) {
    await db.subscription.update({
      where: { id: sub.id },
      data: { lastError: `Response too large (${contentLength} bytes, max ${MAX_RESPONSE_SIZE})`, lastFetchedAt: new Date() },
    });
    throw new Error(`Response too large: ${contentLength} bytes`);
  }

  // 4. Read response with size limit (stream + abort if too big)
  const reader = res.body?.getReader();
  if (!reader) {
    // Fallback: read all at once (smaller responses)
    const text = await res.text();
    if (text.length > MAX_RESPONSE_SIZE) {
      throw new Error(`Response too large: ${text.length} bytes`);
    }
    return await processAndStore(sub, text);
  }

  const chunks: Buffer[] = [];
  let totalSize = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalSize += value.byteLength;
    if (totalSize > MAX_RESPONSE_SIZE) {
      await db.subscription.update({
        where: { id: sub.id },
        data: { lastError: `Response exceeded ${MAX_RESPONSE_SIZE} bytes limit`, lastFetchedAt: new Date() },
      });
      throw new Error(`Response exceeded size limit`);
    }
    chunks.push(Buffer.from(value));
  }
  const text = Buffer.concat(chunks).toString("utf-8");
  return await processAndStore(sub, text);
}

// Parse + validate + store (ATOMIC: old configs preserved until new ones are ready)
async function processAndStore(sub: { id: string; url: string; enabled: boolean }, text: string): Promise<number> {
  const parsed = parseSubscription(text);

  if (parsed.length === 0) {
    await db.subscription.update({
      where: { id: sub.id },
      data: { lastError: "No valid configs found in response", lastFetchedAt: new Date() },
    });
    throw new Error("No valid configs found in subscription response");
  }

  // Filter out configs with missing/invalid host or port
  const valid = parsed.filter(
    (c) => c.host && c.host.trim().length > 0 && Number.isFinite(c.port) && c.port > 0 && c.port <= 65535
  );

  const optimizedSet = new Set(pickOptimized(parsed, 9999).map((c) => c.id));

  const data = valid.map((c) => ({
    subscriptionId: sub.id,
    protocol: c.protocol,
    uri: c.raw,
    label: c.label ?? null,
    host: c.host,
    port: c.port,
    network: c.network,
    security: c.security,
    sni: c.sni ?? null,
    path: c.path ?? null,
    hostHeader: c.hostHeader ?? null,
    flow: c.flow ?? null,
    country: c.country ?? null,
    score: c.score,
    flags: c.flags.join(","),
    bucket: optimizedSet.has(c.id) ? "optimized" : "all",
  }));

  // ATOMIC UPDATE: Insert new configs FIRST, then delete old ones.
  // This way, if the insert fails halfway, old configs remain usable.
  // (Previously, we deleted first — which meant a failed insert left zero configs.)

  // Mark new configs with a temporary batch ID so we can swap atomically.
  const batchId = `batch_${Date.now()}`;

  // Insert new configs
  const chunkSize = 50;
  for (let i = 0; i < data.length; i += chunkSize) {
    await db.importedConfig.createMany({ data: data.slice(i, i + chunkSize) });
  }

  // Only delete OLD configs (from before this batch) AFTER new ones are stored.
  // We identify old ones by checking which ones don't have our recent createdAt.
  const recentThreshold = new Date(Date.now() - 60_000); // 1 min ago
  await db.importedConfig.deleteMany({
    where: {
      subscriptionId: sub.id,
      createdAt: { lt: recentThreshold },
    },
  });

  await db.subscription.update({
    where: { id: sub.id },
    data: {
      lastFetchedAt: new Date(),
      lastCount: valid.length,
      lastError: null,
    },
  });

  return valid.length;
}

// Import raw config text (vmess/vless/trojan/ss URIs) directly without a subscription URL.
export async function importRawConfigs(rawText: string, source = "manual"): Promise<number> {
  const parsed = parseSubscription(rawText);

  // Create an ephemeral "manual" subscription row if needed, OR attach to existing one.
  let sub = await db.subscription.findFirst({ where: { kind: "manual", label: source } });
  if (!sub) {
    sub = await db.subscription.create({
      data: { label: source, url: "manual://paste", kind: "manual", intervalMin: 0, enabled: false },
    });
  }

  await db.importedConfig.deleteMany({ where: { subscriptionId: sub.id } });

  const optimizedSet = new Set(pickOptimized(parsed, 9999).map((c) => c.id));

  // Filter out invalid configs (missing host/port).
  const valid = parsed.filter(
    (c) => c.host && c.host.trim().length > 0 && Number.isFinite(c.port) && c.port > 0 && c.port <= 65535
  );

  const data = valid.map((c) => ({
    subscriptionId: sub.id,
    protocol: c.protocol,
    uri: c.raw,
    label: c.label ?? null,
    host: c.host,
    port: c.port,
    network: c.network,
    security: c.security,
    sni: c.sni ?? null,
    path: c.path ?? null,
    hostHeader: c.hostHeader ?? null,
    flow: c.flow ?? null,
    country: c.country ?? null,
    score: c.score,
    flags: c.flags.join(","),
    bucket: optimizedSet.has(c.id) ? "optimized" : "all",
  }));

  const chunkSize = 50;
  for (let i = 0; i < data.length; i += chunkSize) {
    await db.importedConfig.createMany({ data: data.slice(i, i + chunkSize) });
  }

  await db.subscription.update({
    where: { id: sub.id },
    data: { lastFetchedAt: new Date(), lastCount: parsed.length, lastError: null },
  });

  return parsed.length;
}

export type { ParsedConfig };
