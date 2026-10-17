// DISTORT — /api/vip/grant
// POST: { email, durationDays?, adminEmail? }
// Admin-only: grants VIP to a user.
// - adminEmail must match a user with isAdmin === true
// - durationDays: null = permanent, number = expires after N days

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkAuth } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const authFail = checkAuth(req);
  if (authFail) return authFail;

  try {
    const body = await req.json();
    const { email, durationDays, adminEmail } = body;

    if (!email) {
      return NextResponse.json({ error: "email is required" }, { status: 400 });
    }

    // Verify admin
    if (!adminEmail) {
      return NextResponse.json({ error: "adminEmail is required" }, { status: 400 });
    }

    const admin = await db.user.findFirst({ where: { email: adminEmail } });
    if (!admin || !admin.isAdmin) {
      return NextResponse.json({ error: "Not authorized — admin access required" }, { status: 403 });
    }

    // Find or create user
    let user = await db.user.findFirst({ where: { email } });
    if (!user) {
      user = await db.user.create({
        data: { email, tier: "vip" },
      });
    }

    // Calculate VIP expiry
    const vipUntil = durationDays
      ? new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000)
      : null; // null = permanent

    const updated = await db.user.update({
      where: { id: user.id },
      data: { tier: "vip", vipUntil },
    });

    return NextResponse.json({
      ok: true,
      email: updated.email,
      tier: updated.tier,
      vipUntil: updated.vipUntil,
      message: durationDays
        ? `VIP granted for ${durationDays} days`
        : "VIP granted permanently",
    });
  } catch (err) {
    console.error("[api/vip/grant] failed", err);
    return NextResponse.json({ error: "Grant failed" }, { status: 500 });
  }
}
