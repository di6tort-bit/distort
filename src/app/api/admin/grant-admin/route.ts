// DISTORT — /api/admin/grant-admin
// POST: { email, adminEmail } — grant admin privileges to a user
// Only existing admins can grant admin to others

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

    // Find or create user
    let user = await db.user.findFirst({ where: { email } });
    if (!user) {
      user = await db.user.create({ data: { email, isAdmin: true, approvedBy: admin.id } });
    }

    const updated = await db.user.update({
      where: { id: user.id },
      data: { isAdmin: true, approvedBy: admin.id },
    });

    return NextResponse.json({
      ok: true,
      email: updated.email,
      isAdmin: updated.isAdmin,
      approvedBy: admin.email,
      message: `${email} is now an admin (approved by ${adminEmail})`,
    });
  } catch (err) {
    return NextResponse.json({ error: "Grant admin failed" }, { status: 500 });
  }
}
