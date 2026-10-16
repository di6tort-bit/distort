// DISTORT — /api/account
// GET : return first User row (demo "founder@distort.app"), or default free-tier placeholder.
// POST: { email, name?, referral? } -> create a free user.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

const PLACEHOLDER_USER = {
  id: "guest",
  email: "guest@distort.app",
  name: "Guest",
  tier: "free",
  referral: null as string | null,
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
};

export async function GET() {
  try {
    const user = await db.user.findFirst({ orderBy: { createdAt: "asc" } });
    if (!user) {
      return NextResponse.json({ user: PLACEHOLDER_USER, tier: { name: "free", price: 0, features: ["All servers", "Stealth nodes", "No data cap", "No signup required"] } });
    }
    return NextResponse.json({
      user,
      tier: {
        name: user.tier,
        price: 0,
        features: [
          "All servers",
          "Stealth nodes",
          "No data cap",
          "No signup required",
        ],
      },
    });
  } catch (err) {
    console.error("[api/account] GET failed", err);
    return NextResponse.json(
      { error: "Failed to load account" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body?.email || "").trim();
    const name = body?.name ? String(body.name) : null;
    const referral = body?.referral ? String(body.referral) : null;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: "A valid email is required" },
        { status: 400 }
      );
    }

    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { error: "Email already registered", user: existing },
        { status: 409 }
      );
    }

    const user = await db.user.create({
      data: { email, name, referral, tier: "free" },
    });
    return NextResponse.json({ user }, { status: 201 });
  } catch (err) {
    console.error("[api/account] POST failed", err);
    return NextResponse.json(
      { error: "Failed to create account" },
      { status: 500 }
    );
  }
}
