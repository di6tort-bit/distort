// DISTORT — /api/servers/[id]/config
// GET  ?protocol=wireguard&userTag=distort-free  -> generate config
// POST { protocol, userTag? }                    -> generate config
// Both persist a VpnConfig row and return { filename, mime, content }.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generateConfig, type Protocol } from "@/lib/config-generator";

const VALID: Protocol[] = ["wireguard", "v2ray", "trojan", "shadowsocks", "ssh"];

async function buildConfig(id: string, protocol: string, userTag: string) {
  if (!VALID.includes(protocol as Protocol)) {
    return NextResponse.json(
      { error: `Invalid protocol: ${protocol}` },
      { status: 400 }
    );
  }
  const server = await db.vpnServer.findUnique({ where: { id } });
  if (!server) {
    return NextResponse.json({ error: "Server not found" }, { status: 404 });
  }

  const cfg = generateConfig(protocol as Protocol, server, userTag);

  try {
    await db.vpnConfig.create({
      data: {
        label: `${server.code}-${protocol}`,
        protocol,
        content: cfg.content,
        source: "distort",
        country: server.country,
      },
    });
  } catch (err) {
    // Persistence failure shouldn't break the response — log and continue.
    console.error("[api/servers/[id]/config] failed to persist VpnConfig", err);
  }

  return NextResponse.json(cfg);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const protocol = searchParams.get("protocol") || "wireguard";
    const userTag = searchParams.get("userTag") || "distort-free";
    return await buildConfig(id, protocol, userTag);
  } catch (err) {
    console.error("[api/servers/[id]/config] GET failed", err);
    return NextResponse.json({ error: "Failed to generate config" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const protocol = String(body?.protocol || "wireguard");
    const userTag = String(body?.userTag || "distort-free");
    return await buildConfig(id, protocol, userTag);
  } catch (err) {
    console.error("[api/servers/[id]/config] POST failed", err);
    return NextResponse.json({ error: "Failed to generate config" }, { status: 500 });
  }
}
