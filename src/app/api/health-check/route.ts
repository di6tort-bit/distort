// DISTORT — /api/health-check
// POST { host, port }: probe a single endpoint via probeReachability.
// GET              : sweep all online servers (Promise.all) and return per
//                    server reach + latency.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { probeReachability } from "@/lib/anti-censor";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const host = String(body?.host || "");
    const port = Number(body?.port);

    if (!host || !Number.isFinite(port) || port <= 0 || port > 65535) {
      return NextResponse.json(
        { error: "host and a valid port (1..65535) are required" },
        { status: 400 }
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
