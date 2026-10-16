// DISTORT — /api/subscriptions
// GET: list all subscription sources
// POST: create a new subscription (auto-fetches immediately)

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fetchAndParseSubscription } from "@/lib/subscription-fetcher";

export async function GET() {
  try {
    const subs = await db.subscription.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { configs: true } } },
    });
    return NextResponse.json({ subscriptions: subs });
  } catch (err) {
    console.error("[api/subscriptions] GET failed", err);
    return NextResponse.json({ error: "Failed to list subscriptions" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { label, url, kind = "custom", intervalMin = 60, enabled = true, fetchNow = true } = body;
    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "url is required" }, { status: 400 });
    }
    const sub = await db.subscription.create({
      data: { label: label || url.slice(0, 60), url, kind, intervalMin, enabled },
    });

    if (fetchNow) {
      try {
        const count = await fetchAndParseSubscription(sub);
        return NextResponse.json({ subscription: { ...sub, lastCount: count } });
      } catch (e) {
        return NextResponse.json(
          { subscription: sub, warning: `Saved but fetch failed: ${(e as Error).message}` },
          { status: 201 }
        );
      }
    }
    return NextResponse.json({ subscription: sub }, { status: 201 });
  } catch (err) {
    console.error("[api/subscriptions] POST failed", err);
    return NextResponse.json({ error: "Failed to create subscription" }, { status: 500 });
  }
}
