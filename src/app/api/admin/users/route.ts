// DISTORT — /api/admin/users
// Admin-only: list all users, their tier, VIP status, admin status
// Query: ?tier=free|vip|admin  to filter

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkAuth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const authFail = checkAuth(req);
  if (authFail) return authFail;

  try {
    const url = new URL(req.url);
    const adminEmail = url.searchParams.get("adminEmail");
    const tierFilter = url.searchParams.get("tier");

    // Verify admin
    if (!adminEmail) {
      return NextResponse.json({ error: "adminEmail is required" }, { status: 400 });
    }
    const admin = await db.user.findFirst({ where: { email: adminEmail } });
    if (!admin || !admin.isAdmin) {
      return NextResponse.json({ error: "Not authorized — admin access required" }, { status: 403 });
    }

    const where: any = {};
    if (tierFilter === "vip") {
      where.tier = "vip";
    } else if (tierFilter === "free") {
      where.tier = "free";
    } else if (tierFilter === "admin") {
      where.isAdmin = true;
    }

    const users = await db.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        name: true,
        tier: true,
        vipUntil: true,
        isAdmin: true,
        approvedBy: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ users, count: users.length });
  } catch (err) {
    console.error("[api/admin/users] GET failed", err);
    return NextResponse.json({ error: "Failed to list users" }, { status: 500 });
  }
}
