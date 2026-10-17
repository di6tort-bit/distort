// DISTORT — /api/emergency/candidates/[id]/uri
// POST: fetch the configUri for a single candidate
//
// SECURITY (addresses user review issue #1):
//   The /api/emergency/plan endpoint returns candidate metadata (label, host,
//   port, protocol, score) but NEVER the configUri — because configUri contains
//   credentials (UUIDs, passwords, Reality public keys). This endpoint is the
//   ONLY way to retrieve the URI, and it is:
//     - Rate-limited (20 requests/minute per IP)
//     - Uses POST (not GET) so the URI is never cached by browsers or CDNs
//     - In production (DISTORT_API_KEY set), requires x-api-key header
//     - In dev mode (no key), open but logged with a warning
//
// WHY NOT INCLUDE configUri IN THE PLAN?
//   The plan endpoint returns up to 100 candidates. If we included configUri
//   there, a single anonymous request would harvest 100 sets of credentials.
//   This endpoint returns ONE uri per call, rate-limited, so mass harvesting
//   is impractical.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkAuth } from "@/lib/auth";
import { isRateLimited, getClientIp } from "@/lib/emergency-connectivity/rate-limiter";

const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // 1. Auth check (in production, requires x-api-key)
  const authFail = checkAuth(req);
  if (authFail) return authFail;

  // 2. Rate limit
  const ip = getClientIp(req);
  if (isRateLimited(`uri:${ip}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS)) {
    return NextResponse.json(
      { error: "Too many URI requests. Try again in a minute." },
      { status: 429 }
    );
  }

  try {
    const { id } = await params;

    // 3. Look up the config in the DB
    const config = await db.importedConfig.findUnique({
      where: { id },
      select: {
        id: true,
        uri: true,
        protocol: true,
        host: true,
        port: true,
      },
    });

    if (!config) {
      return NextResponse.json(
        { error: "Candidate not found" },
        { status: 404 }
      );
    }

    // 4. Return the URI
    // NOTE: We intentionally return the raw URI here — the client needs it
    // to pass to xray-core. We do NOT log it server-side.
    return NextResponse.json({
      id: config.id,
      uri: config.uri,
      protocol: config.protocol,
      host: config.host,
      port: config.port,
    });
  } catch (err) {
    console.error("[api/emergency/candidates/[id]/uri] POST failed", err);
    return NextResponse.json(
      { error: "Failed to fetch candidate URI" },
      { status: 500 }
    );
  }
}
