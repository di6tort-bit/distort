// DISTORT — /api/health-check
// POST { host, port }: probe a single endpoint via probeReachability.
// GET              : sweep all online servers (Promise.all) and return per
//                    server reach + latency.
//
// SSRF PROTECTION:
// - POST only allows probing hosts that are in the Distort server list or
//   Community Mesh configs. This prevents attackers from using the API as a
//   port scanner for internal/private networks.
// - Private IPs (10.x, 172.16-31.x, 192.168.x, 127.x, ::1, fc00::/7) are blocked.
// - Rate limited to 20 requests per minute per IP.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { probeReachability } from "@/lib/anti-censor";

// Simple in-memory rate limiter (per IP, per minute)
const rateMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 20; // requests per minute
const RATE_WINDOW = 60_000;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW });
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT;
}

// Block private/reserved IP ranges to prevent SSRF
function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase().trim();
  // IPv4 private ranges
  if (/^10\./.test(h)) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[01])\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  if (/^127\./.test(h)) return true;
  if (/^0\./.test(h)) return true;
  if (/^169\.254\./.test(h)) return true; // link-local
  if (/^100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\./.test(h)) return true; // CGNAT
  // IPv6 private
  if (h === "::1" || /^fc/.test(h) || /^fd/.test(h) || /^fe80/.test(h)) return true;
  // localhost
  if (h === "localhost") return true;
  return false;
}

export async function POST(req: NextRequest) {
  try {
    // Rate limit
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (isRateLimited(ip)) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Max 20 requests per minute." },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const host = String(body?.host || "");
    const port = Number(body?.port);

    if (!host || !Number.isFinite(port) || port <= 0 || port > 65535) {
      return NextResponse.json(
        { error: "host and a valid port (1..65535) are required" },
        { status: 400 }
      );
    }

    // SSRF protection: block private/internal IPs
    if (isPrivateHost(host)) {
      return NextResponse.json(
        { error: "Probing private/internal hosts is not allowed" },
        { status: 403 }
      );
    }

    // SSRF protection: only allow hosts that exist in our server list or
    // Community Mesh configs. This prevents the API from being used as a
    // general-purpose port scanner.
    const knownServers = await db.vpnServer.findMany({
      where: { host },
      select: { host: true },
      take: 1,
    });
    const knownConfigs = await db.importedConfig.findFirst({
      where: { host },
      select: { host: true },
    });

    if (knownServers.length === 0 && !knownConfigs) {
      return NextResponse.json(
        { error: "Host not in the Distort server list or Community Mesh. Probing unknown hosts is not allowed." },
        { status: 403 }
      );
    }

    const result = await probeReachability(host, port);
    return NextResponse.json({ host, port, ok: result.ok, latencyMs: result.latencyMs });
  } catch (err) {
    console.error("[api/health-check] POST failed", err);
    return NextResponse.json(
      { error: "Health check failed" },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const servers = await db.vpnServer.findMany({
      where: { online: true },
      select: { id: true, code: true, host: true, port: true },
    });

    const results = await Promise.all(
      servers.map(async (s) => {
        const r = await probeReachability(s.host, s.port);
        return {
          id: s.id,
          code: s.code,
          host: s.host,
          port: s.port,
          ok: r.ok,
          latencyMs: r.latencyMs,
        };
      })
    );

    return NextResponse.json({ results });
  } catch (err) {
    console.error("[api/health-check] GET failed", err);
    return NextResponse.json(
      { error: "Health sweep failed" },
      { status: 500 }
    );
  }
}
