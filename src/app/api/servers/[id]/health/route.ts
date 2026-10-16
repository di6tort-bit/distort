// DISTORT — /api/servers/[id]/health
// GET: probe a single server via probeReachability, return { ok, latencyMs }.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { probeReachability } from "@/lib/anti-censor";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const server = await db.vpnServer.findUnique({
      where: { id },
      select: { id: true, code: true, host: true, port: true, online: true },
    });
    if (!server) {
      return NextResponse.json({ error: "Server not found" }, { status: 404 });
    }

    const r = await probeReachability(server.host, server.port);
    return NextResponse.json({
      id: server.id,
      code: server.code,
      host: server.host,
      port: server.port,
      online: server.online,
      ok: r.ok,
      latencyMs: r.latencyMs,
    });
  } catch (err) {
    console.error("[api/servers/[id]/health] GET failed", err);
    return NextResponse.json(
      { error: "Failed to probe server" },
      { status: 500 }
    );
  }
}
