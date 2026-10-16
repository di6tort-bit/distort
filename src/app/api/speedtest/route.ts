// DISTORT — /api/speedtest
// POST { serverId }: simulate a speed test against the given server.
// - Waits ~1.2s to emulate real probe.
// - Returns { downloadMbps, uploadMbps, pingMs, jitterMs, serverId }.
// - Persists a synthetic Session row tagged protocol="speedtest" so the test
//   shows up in stats / session history.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

function jitter(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const serverId = String(body?.serverId || "");
    if (!serverId) {
      return NextResponse.json(
        { error: "serverId is required" },
        { status: 400 }
      );
    }

    const server = await db.vpnServer.findUnique({ where: { id: serverId } });
    if (!server) {
      return NextResponse.json({ error: "Server not found" }, { status: 404 });
    }
    if (!server.online) {
      return NextResponse.json(
        { error: "Server is offline" },
        { status: 409 }
      );
    }

    await wait(1200);

    // Real-world throughput is a fraction of the rated bandwidth, modulated
    // by current server load.
    const downCap = Math.min(server.downMbps, 1000); // realistic consumer cap
    const upCap = Math.min(server.upMbps, 500);
    const loadFactor = 1 - server.load / 100; // 0..1
    const downloadMbps = Math.round(
      downCap * jitter(0.25, 0.55) * (0.6 + loadFactor * 0.4)
    );
    const uploadMbps = Math.round(
      upCap * jitter(0.10, 0.30) * (0.6 + loadFactor * 0.4)
    );
    const pingMs = Math.max(
      1,
      Math.round(server.ping * jitter(0.9, 1.2) + jitter(1, 8))
    );
    const jitterMs = Math.round(jitter(1, 12));

    // Persist a synthetic session so speed tests feed into stats / history.
    try {
      await db.session.create({
        data: {
          serverId: server.id,
          protocol: "speedtest",
          status: "disconnected",
          bytesDown: downloadMbps * 125 * 8 * 10, // ~10s of measured throughput, in bytes
          bytesUp: uploadMbps * 125 * 8 * 10,
          durationSec: 10,
          startedAt: new Date(),
          endedAt: new Date(),
        },
      });
    } catch (err) {
      console.error("[api/speedtest] failed to persist synthetic session", err);
    }

    return NextResponse.json({
      downloadMbps,
      uploadMbps,
      pingMs,
      jitterMs,
      serverId: server.id,
      serverCode: server.code,
    });
  } catch (err) {
    console.error("[api/speedtest] POST failed", err);
    return NextResponse.json(
      { error: "Speed test failed" },
      { status: 500 }
    );
  }
}
