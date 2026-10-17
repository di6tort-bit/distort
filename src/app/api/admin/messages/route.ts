// DISTORT — /api/admin/messages
// GET: list all messages (filterable by type/status)
// POST: create a new message (from contact form — public, no auth needed)

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkAuth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const authFail = checkAuth(req);
  if (authFail) return authFail;

  try {
    const url = new URL(req.url);
    const adminEmail = url.searchParams.get("adminEmail");
    const typeFilter = url.searchParams.get("type");
    const statusFilter = url.searchParams.get("status");

    if (!adminEmail) {
      return NextResponse.json({ error: "adminEmail is required" }, { status: 400 });
    }
    const admin = await db.user.findFirst({ where: { email: adminEmail } });
    if (!admin || !admin.isAdmin) {
      return NextResponse.json({ error: "Not authorized — admin access required" }, { status: 403 });
    }

    const where: any = {};
    if (typeFilter) where.type = typeFilter;
    if (statusFilter) where.status = statusFilter;

    const messages = await db.adminMessage.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ messages, count: messages.length });
  } catch (err) {
    console.error("[api/admin/messages] GET failed", err);
    return NextResponse.json({ error: "Failed to list messages" }, { status: 500 });
  }
}

// POST — public endpoint (no auth) for contact/collaboration form
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { type, name, email, subject, message } = body;

    if (!name || !email || !message) {
      return NextResponse.json({ error: "name, email and message are required" }, { status: 400 });
    }

    // Validate type
    const validTypes = ["vip_request", "collaboration", "support", "bug_report"];
    const messageType = validTypes.includes(type) ? type : "support";

    // Rate limit: max 5 messages per email per hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentMessages = await db.adminMessage.count({
      where: { email, createdAt: { gte: oneHourAgo } },
    });
    if (recentMessages >= 5) {
      return NextResponse.json({ error: "Rate limit exceeded. Max 5 messages per hour." }, { status: 429 });
    }

    const msg = await db.adminMessage.create({
      data: {
        type: messageType,
        name,
        email,
        subject: subject || "(no subject)",
        message,
      },
    });

    return NextResponse.json({ ok: true, id: msg.id }, { status: 201 });
  } catch (err) {
    console.error("[api/admin/messages] POST failed", err);
    return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
  }
}
