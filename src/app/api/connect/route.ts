// DISTORT — /api/connect
// POST { serverId, protocol, action }: action is "connect" | "disconnect".
//
// IMPORTANT: This API ONLY creates/updates a Session record in the database.
// It does NOT start xray, create a TUN device, or change system routing.
//
// The REAL VPN connection happens in the Electron desktop app's main process:
//   desktop/src/main.ts → startVpnEngine() → spawns xray.exe
//
// The web dashboard calls this API for bookkeeping (session history, stats),
// but the actual tunnel is managed by the Electron main process via IPC.
//
// If you're running the web app in a browser (not Electron), this API
// creates a session record but NO actual VPN tunnel is established.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const serverId = String(body?.serverId || "");
    const protocol = String(body?.protocol || "wireguard");
    const action = String(body?.action || "").toLowerCase();

    if (!serverId) {
      return NextResponse.json(
        { error: "serverId is required" },
        { status: 400 }
      );
    }
    if (action !== "connect" && action !== "disconnect") {
      return NextResponse.json(
        { error: 'action must be "connect" or "disconnect"' },
        { status: 400 }
      );
    }

    const server = await db.vpnServer.findUnique({ where: { id: serverId } });
    if (!server) {
      return NextResponse.json({ error: "Server not found" }, { status: 404 });
    }

    if (action === "connect") {
      const session = await db.session.create({
        data: {
          serverId,
          protocol,
          status: "connecting",
          startedAt: new Date(),
        },
        include: { server: true },
      });
      return NextResponse.json({ ok: true, session, server });
    }

    // disconnect: find latest active session for this server.
    const latest = await db.session.findFirst({
      where: {
        serverId,
        status: { in: ["connecting", "connected"] },
      },
      orderBy: { startedAt: "desc" },
    });

    if (!latest) {
      return NextResponse.json(
        { ok: false, error: "No active session to disconnect" },
        { status: 404 }
      );
    }

    const session = await db.session.update({
      where: { id: latest.id },
      data: { status: "disconnected", endedAt: new Date() },
      include: { server: true },
    });

    return NextResponse.json({ ok: true, session, server });
  } catch (err) {
    console.error("[api/connect] POST failed", err);
    return NextResponse.json(
      { error: "Failed to handle connection action" },
      { status: 500 }
    );
  }
}
