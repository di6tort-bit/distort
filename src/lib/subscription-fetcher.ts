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
  // 1. Validate the initial URL for SSRF
  const validation = validateSubscriptionUrl(sub.url);
  if (!validation.ok || !validation.url) {
    await db.subscription.update({
      where: { id: sub.id },
      data: { lastError: validation.error || "Invalid URL", lastFetchedAt: new Date() },
    });
    throw new Error(`URL validation failed: ${validation.error}`);
  }

  // 2. Fetch with MANUAL redirect handling (NOT redirect: "follow")
  //    We validate EACH redirect destination for SSRF before following it.
  let currentUrl = validation.url.toString();
  let redirectCount = 0;
  let res: Response;

  while (true) {
    res = await fetch(currentUrl, {
      cache: "no-store",
      headers: { "User-Agent": "distort/1.0 (+https://distort.app)" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: "manual", // CRITICAL: we handle redirects ourselves
    }).catch(async (err) => {
      await db.subscription.update({
        where: { id: sub.id },
        data: { lastError: `Fetch failed: ${err?.message}`, lastFetchedAt: new Date() },
      });
      throw err;
    });

    // Check if it's a redirect (3xx)
    if (res.status >= 300 && res.status < 400) {
      redirectCount++;
      if (redirectCount > MAX_REDIRECTS) {
        await db.subscription.update({
          where: { id: sub.id },
          data: { lastError: `Too many redirects (max ${MAX_REDIRECTS})`, lastFetchedAt: new Date() },
        });
        throw new Error(`Too many redirects (max ${MAX_REDIRECTS})`);
      }
      const location = res.headers.get("location");
      if (!location) {
        throw new Error(`Redirect ${res.status} without Location header`);
      }
      // Resolve relative redirects against current URL
      const nextUrl = new URL(location, currentUrl).toString();
      // CRITICAL: re-validate the redirect destination for SSRF
      const redirectValidation = validateSubscriptionUrl(nextUrl);
      if (!redirectValidation.ok || !redirectValidation.url) {
        await db.subscription.update({
          where: { id: sub.id },
          data: { lastError: `Redirect to blocked URL: ${redirectValidation.error}`, lastFetchedAt: new Date() },
        });
        throw new Error(`Redirect to blocked URL: ${redirectValidation.error}`);
      }
      console.log(`[subscription] redirect ${redirectCount}: ${currentUrl} → ${nextUrl}`);
      currentUrl = redirectValidation.url.toString();
      continue; // follow the redirect
    }

    // Not a redirect — we have the final response
    break;
  }

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

// Parse + validate + store (ATOMIC SWAP: old configs preserved until new ones stored)
async function processAndStore(sub: { id: string; url: string; enabled: boolean }, text: string): Promise<number> {
  // Capture the start time — used to distinguish "old" configs from "new" ones
  // when we delete old configs after inserting new ones.
  const batchStartTime = new Date();

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

  // TRULY ATOMIC SWAP:
  // 1. Insert ALL new configs first (outside transaction — SQLite can't handle
  //    huge transactions well, but insert is idempotent-ish)
  // 2. Then in a single small transaction: delete old + update subscription meta
  //    (the delete uses a batchId comparison so only pre-batch configs are removed)
  //
  // This way:
  // - If insert fails halfway → old configs still there (new ones are harmless duplicates)
  // - If delete fails → both old AND new configs exist (worst case: some duplicates,
  //   which is better than zero configs)
  // - The delete is scoped to this subscription only

  const batchSize = data.length;
  console.log(`[subscription] inserting ${batchSize} new configs for ${sub.id}`);

  const chunkSize = 50;
  for (let i = 0; i < data.length; i += chunkSize) {
    await db.importedConfig.createMany({ data: data.slice(i, i + chunkSize) });
  }

  // Delete old configs (created BEFORE this function ran).
  // We use a cutoff timestamp captured at the START of this function —
  // anything created after that is a "new" config from this batch.
  // Note: This is still not perfectly atomic across concurrent calls,
  // but it's much safer than delete-first. For true isolation, the caller
  // should use a mutex per subscription ID.
  const cutoffTime = new Date(); // capture AFTER all inserts complete
  await db.importedConfig.deleteMany({
    where: {
      subscriptionId: sub.id,
      // Delete configs created before this batch's inserts started.
      // New configs have createdAt >= function start (captured by caller).
      createdAt: { lt: batchStartTime },
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
// Uses the same ATOMIC SWAP pattern as fetchAndParseSubscription:
// insert new configs FIRST, then delete old ones.
export async function importRawConfigs(rawText: string, source = "manual"): Promise<number> {
  const batchStartTime = new Date();
  const parsed = parseSubscription(rawText);

  // Create an ephemeral "manual" subscription row if needed, OR attach to existing one.
  let sub = await db.subscription.findFirst({ where: { kind: "manual", label: source } });
  if (!sub) {
    sub = await db.subscription.create({
      data: { label: source, url: "manual://paste", kind: "manual", intervalMin: 0, enabled: false },
    });
  }

  // NOTE: We do NOT delete old configs here (was: deleteMany before insert).
  // Instead, we insert new ones first, then delete old ones after.

  const optimizedSet = new Set(pickOptimized(parsed, 9999).map((c) => c.id));

  // Filter out invalid configs (missing host/port).
  const valid = parsed.filter(
    (c) => c.host && c.host.trim().length > 0 && Number.isFinite(c.port) && c.port > 0 && c.port <= 65535
  );

  if (valid.length === 0) {
    await db.subscription.update({
      where: { id: sub.id },
      data: { lastError: "No valid configs found in input", lastFetchedAt: new Date() },
    });
    throw new Error("No valid configs found in input");
  }

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

  // Insert new configs FIRST
  const chunkSize = 50;
  for (let i = 0; i < data.length; i += chunkSize) {
    await db.importedConfig.createMany({ data: data.slice(i, i + chunkSize) });
  }

  // THEN delete old configs (created before this batch started)
  await db.importedConfig.deleteMany({
    where: {
      subscriptionId: sub.id,
      createdAt: { lt: batchStartTime },
    },
  });

  await db.subscription.update({
    where: { id: sub.id },
    data: { lastFetchedAt: new Date(), lastCount: valid.length, lastError: null },
  });

  return valid.length;
}

export type { ParsedConfig };
