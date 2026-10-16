// DISTORT — /api/imported-configs/check
// POST: probe TCP reachability of optimized configs (best-effort, sandbox-limited)

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { probeReachability } from "@/lib/anti-censor";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Number(body?.limit ?? 30), 80);

    const configs = await db.importedConfig.findMany({
      where: { bucket: "optimized" },
      orderBy: { score: "desc" },
      take: limit,
    });

    const results = await Promise.all(
      configs.map(async (c) => {
        const { ok, latencyMs } = await probeReachability(c.host, c.port);
        await db.importedConfig.update({
          where: { id: c.id },
          data: { reach: ok ? "ok" : "fail", latencyMs, checkedAt: new Date() },
        });
        return { id: c.id, host: c.host, port: c.port, ok, latencyMs };
      })
    );

    const okCount = results.filter((r) => r.ok).length;
    return NextResponse.json({ checked: results.length, ok: okCount, results });
  } catch (err) {
    console.error("[api/imported-configs/check] POST failed", err);
    return NextResponse.json({ error: "Check failed" }, { status: 500 });
  }
}
