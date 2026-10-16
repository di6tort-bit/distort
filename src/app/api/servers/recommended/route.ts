// DISTORT — /api/servers/recommended
// GET: auto-pick best server using pickAutoServer + assessNetworkClimate.
// Returns { server, climate, recommendedProtocol }.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { assessNetworkClimate, pickAutoServer } from "@/lib/anti-censor";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const allowPremium = searchParams.get("allowPremium") === "true";
    const stealthPref = searchParams.get("stealth") !== "false"; // default true

    const rows = await db.vpnServer.findMany();
    const servers = rows.map((s) => ({
      ...s,
      protocols: s.protocols ? s.protocols.split(",").filter(Boolean) : [],
    }));

    // Use the median ping of online stealth servers as a proxy for current latency.
    const onlinePings = servers
      .filter((s) => s.online)
      .map((s) => s.ping)
      .sort((a, b) => a - b);
    const samplePing =
      onlinePings.length > 0
        ? onlinePings[Math.floor(onlinePings.length / 2)]
        : 0;

    const stealthAvailable = servers.some((s) => s.online && s.stealth);
    const climate = assessNetworkClimate(samplePing, stealthAvailable);

    const picked = pickAutoServer(servers, {
      stealth: stealthPref,
      allowPremium,
    });

    if (!picked) {
      return NextResponse.json(
        { error: "No servers available" },
        { status: 503 }
      );
    }

    return NextResponse.json({
      server: picked,
      climate,
      recommendedProtocol: climate.recommendedProtocol,
    });
  } catch (err) {
    console.error("[api/servers/recommended] GET failed", err);
    return NextResponse.json(
      { error: "Failed to pick recommended server" },
      { status: 500 }
    );
  }
}
