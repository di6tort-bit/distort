// DISTORT — /api/admin/messages/[id]
// PATCH: update message status or reply (admin only)
// DELETE: delete message (admin only)

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkAuth } from "@/lib/auth";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authFail = checkAuth(req);
  if (authFail) return authFail;

  try {
    const { id } = await params;
    const body = await req.json();
    const { status, reply, adminEmail } = body;

    if (!adminEmail) {
      return NextResponse.json({ error: "adminEmail is required" }, { status: 400 });
    }
    const admin = await db.user.findFirst({ where: { email: adminEmail } });
    if (!admin || !admin.isAdmin) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const patch: any = {};
    if (status) patch.status = status;
    if (reply) {
      patch.reply = reply;
      patch.status = "replied";
      patch.repliedAt = new Date();
      patch.handledBy = admin.id;
    }

    const updated = await db.adminMessage.update({
      where: { id },
      data: patch,
    });

    return NextResponse.json({ message: updated });
  } catch (err) {
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authFail = checkAuth(req);
  if (authFail) return authFail;

  try {
    const { id } = await params;
    const url = new URL(req.url);
    const adminEmail = url.searchParams.get("adminEmail");

    if (!adminEmail) {
      return NextResponse.json({ error: "adminEmail is required" }, { status: 400 });
    }
    const admin = await db.user.findFirst({ where: { email: adminEmail } });
    if (!admin || !admin.isAdmin) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    await db.adminMessage.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
