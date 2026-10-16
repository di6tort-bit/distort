// DISTORT — /api/sessions
// GET : list latest 50 sessions (include server relation).
// POST: { serverId, protocol } -> create session with status="connecting", startedAt=now.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const sessions = await db.session.findMany({
      take: 50,
      orderBy: { createdAt: "desc" },
      include: { server: true },
    });
    return NextResponse.json({ sessions });
  } catch (err) {
    console.error("[api/sessions] GET failed", err);
    return NextResponse.json(
      { error: "Failed to load sessions" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const serverId = String(body?.serverId || "");
    const protocol = String(body?.protocol || "wireguard");

    if (!serverId) {
      return NextResponse.json(
        { error: "serverId is required" },
        { status: 400 }
      );
    }

    const server = await db.vpnServer.findUnique({ where: { id: serverId } });
    if (!server) {
      return NextResponse.json({ error: "Server not found" }, { status: 404 });
    }

    const session = await db.session.create({
      data: {
        serverId,
        protocol,
        status: "connecting",
        startedAt: new Date(),
      },
      include: { server: true },
    });

    return NextResponse.json({ session }, { status: 201 });
  } catch (err) {
    console.error("[api/sessions] POST failed", err);
    return NextResponse.json(
      { error: "Failed to create session" },
      { status: 500 }
    );
  }
}
