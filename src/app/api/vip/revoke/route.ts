// DISTORT — /api/vip/revoke
// POST: { email, adminEmail }
// Admin-only: revokes VIP from a user.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkAuth } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const authFail = checkAuth(req);
  if (authFail) return authFail;

  try {
    const body = await req.json();
    const { email, adminEmail } = body;

    if (!email || !adminEmail) {
      return NextResponse.json({ error: "email and adminEmail are required" }, { status: 400 });
    }

    const admin = await db.user.findFirst({ where: { email: adminEmail } });
    if (!admin || !admin.isAdmin) {
      return NextResponse.json({ error: "Not authorized — admin access required" }, { status: 403 });
    }

    const user = await db.user.findFirst({ where: { email } });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    await db.user.update({
      where: { id: user.id },
      data: { tier: "free", vipUntil: null },
    });

    return NextResponse.json({
      ok: true,
      email,
      message: "VIP revoked — user is now on free tier",
    });
  } catch (err) {
    return NextResponse.json({ error: "Revoke failed" }, { status: 500 });
  }
}
