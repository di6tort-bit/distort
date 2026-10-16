// DISTORT — /api/servers
// GET: list all VpnServer rows sorted by online desc, then ping asc.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const rows = await db.vpnServer.findMany({
      orderBy: [{ online: "desc" }, { ping: "asc" }],
    });
    const servers = rows.map((s) => ({
      ...s,
      protocols: s.protocols ? s.protocols.split(",").filter(Boolean) : [],
    }));
    return NextResponse.json({ servers });
  } catch (err) {
    console.error("[api/servers] GET failed", err);
    return NextResponse.json({ error: "Failed to load servers" }, { status: 500 });
  }
}
