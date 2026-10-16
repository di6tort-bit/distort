// DISTORT — shared subscription fetcher
// Fetches a subscription URL, parses vmess/vless/trojan/ss URIs, scores them,
// and persists as ImportedConfig rows linked to the Subscription.

import { db } from "@/lib/db";
import { parseSubscription, pickOptimized, type ParsedConfig } from "@/lib/config-parser";

export async function fetchAndParseSubscription(sub: {
  id: string;
  url: string;
  enabled: boolean;
}): Promise<number> {
  const res = await fetch(sub.url, {
    cache: "no-store",
    headers: { "User-Agent": "distort/1.0 (+https://distort.app)" },
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    await db.subscription.update({
      where: { id: sub.id },
      data: { lastError: `HTTP ${res.status}`, lastFetchedAt: new Date() },
    });
    throw new Error(`HTTP ${res.status}`);
  }

  const text = await res.text();
  const parsed = parseSubscription(text);

  // Wipe prior configs for this subscription and re-insert (clean refresh).
  await db.importedConfig.deleteMany({ where: { subscriptionId: sub.id } });

  const optimizedSet = new Set(pickOptimized(parsed, 9999).map((c) => c.id));

  // Filter out configs with missing/invalid host or port (Prisma requires both).
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

  // Bulk insert in chunks (SQLite has a 999-param cap).
  const chunkSize = 50;
  for (let i = 0; i < data.length; i += chunkSize) {
    await db.importedConfig.createMany({ data: data.slice(i, i + chunkSize) });
  }

  await db.subscription.update({
    where: { id: sub.id },
    data: {
      lastFetchedAt: new Date(),
      lastCount: parsed.length,
      lastError: null,
    },
  });

  return parsed.length;
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
