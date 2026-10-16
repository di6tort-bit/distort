// DISTORT — /api/subscriptions/[id]/refresh
// POST: re-fetch a subscription and re-parse its configs.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fetchAndParseSubscription } from "@/lib/subscription-fetcher";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const sub = await db.subscription.findUnique({ where: { id } });
    if (!sub) return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
    if (!sub.enabled) return NextResponse.json({ error: "Subscription is disabled" }, { status: 400 });

    const count = await fetchAndParseSubscription(sub);
    return NextResponse.json({ ok: true, count, fetchedAt: new Date().toISOString() });
  } catch (err) {
    console.error("[api/subscriptions/refresh] POST failed", err);
    return NextResponse.json({ error: (err as Error).message || "Refresh failed" }, { status: 500 });
  }
}
