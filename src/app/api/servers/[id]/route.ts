// DISTORT — /api/servers/[id]
// GET: single server by id (404 if not found).

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const server = await db.vpnServer.findUnique({ where: { id } });
    if (!server) {
      return NextResponse.json({ error: "Server not found" }, { status: 404 });
    }
    return NextResponse.json({
      server: {
        ...server,
        protocols: server.protocols
          ? server.protocols.split(",").filter(Boolean)
          : [],
      },
    });
  } catch (err) {
    console.error("[api/servers/[id]] GET failed", err);
    return NextResponse.json({ error: "Failed to load server" }, { status: 500 });
  }
}
