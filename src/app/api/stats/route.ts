// DISTORT — /api/stats
// GET: aggregate dashboard stats — totals, by-protocol breakdown, last 7 days
//      daily usage derived from sessions. Structured for charts.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

export async function GET() {
  try {
    const [sessions, servers, agg] = await Promise.all([
      db.session.findMany({
        select: {
          id: true,
          protocol: true,
          bytesDown: true,
          bytesUp: true,
          durationSec: true,
          startedAt: true,
        },
      }),
      db.vpnServer.findMany({ select: { online: true } }),
      db.session.aggregate({
        _sum: { bytesDown: true, bytesUp: true, durationSec: true },
        _count: { id: true },
      }),
    ]);

    const totalBytesDown = agg._sum.bytesDown ?? 0;
    const totalBytesUp = agg._sum.bytesUp ?? 0;
    const totalDurationSec = agg._sum.durationSec ?? 0;
    const totalSessions = agg._count.id ?? 0;

    const serversOnline = servers.filter((s) => s.online).length;
    const serversTotal = servers.length;

    // By-protocol breakdown
    const byProtocolMap = new Map<
      string,
      { sessions: number; bytesDown: number; bytesUp: number; durationSec: number }
    >();
    for (const s of sessions) {
      const key = s.protocol || "unknown";
      const cur = byProtocolMap.get(key) || {
        sessions: 0,
        bytesDown: 0,
        bytesUp: 0,
        durationSec: 0,
      };
      cur.sessions += 1;
      cur.bytesDown += s.bytesDown;
      cur.bytesUp += s.bytesUp;
      cur.durationSec += s.durationSec;
      byProtocolMap.set(key, cur);
    }
    const byProtocol = Array.from(byProtocolMap.entries()).map(
      ([protocol, v]) => ({ protocol, ...v })
    );

    // Last 7 days daily usage
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const days: { date: string; bytesDown: number; bytesUp: number; sessions: number }[] =
      [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setUTCDate(today.getUTCDate() - i);
      days.push({
        date: dayKey(d),
        bytesDown: 0,
        bytesUp: 0,
        sessions: 0,
      });
    }
    const idxByDate = new Map(days.map((d, i) => [d.date, i]));
    for (const s of sessions) {
      const key = dayKey(s.startedAt);
      const idx = idxByDate.get(key);
      if (idx === undefined) continue;
      days[idx].bytesDown += s.bytesDown;
      days[idx].bytesUp += s.bytesUp;
      days[idx].sessions += 1;
    }

    return NextResponse.json({
      totals: {
        sessions: totalSessions,
        bytesDown: totalBytesDown,
        bytesUp: totalBytesUp,
        durationSec: totalDurationSec,
        serversOnline,
        serversTotal,
      },
      byProtocol,
      daily: days,
    });
  } catch (err) {
    console.error("[api/stats] GET failed", err);
    return NextResponse.json(
      { error: "Failed to compute stats" },
      { status: 500 }
    );
  }
}
