// DISTORT — /api/subscriptions
// GET: list all subscription sources
// POST: create a new subscription (auto-fetches immediately)
//
// PROTECTED: Subscription URLs may contain sensitive info. If DISTORT_API_KEY
// env var is set, this endpoint requires authentication.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fetchAndParseSubscription } from "@/lib/subscription-fetcher";
import { checkAuth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const authFail = checkAuth(req);
  if (authFail) return authFail;
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
  const authFail = checkAuth(req);
  if (authFail) return authFail;
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
