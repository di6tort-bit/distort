// DISTORT — /api/settings
// GET: return the "default" UserSetting row (create if missing).
// PUT: upsert partial settings into the "default" row, return updated.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// All fields are optional on PUT.
type SettingsPatch = {
  protocol?: string;
  killSwitch?: boolean;
  dnsLeakProtection?: boolean;
  ipv6LeakProtection?: boolean;
  splitTunneling?: boolean;
  obfuscation?: boolean;
  autoConnect?: boolean;
  blockTrackers?: boolean;
  blockAds?: boolean;
  stealthMode?: boolean;
  preferredRegion?: string;
  mtu?: number;
  dnsServers?: string;
};

export async function GET() {
  try {
    const settings = await db.userSetting.upsert({
      where: { id: "default" },
      update: {},
      create: { id: "default" },
    });
    return NextResponse.json({ settings });
  } catch (err) {
    console.error("[api/settings] GET failed", err);
    return NextResponse.json(
      { error: "Failed to load settings" },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as SettingsPatch;

    const data: Record<string, unknown> = {};
    if (typeof body.protocol === "string") data.protocol = body.protocol;
    if (typeof body.killSwitch === "boolean") data.killSwitch = body.killSwitch;
    if (typeof body.dnsLeakProtection === "boolean")
      data.dnsLeakProtection = body.dnsLeakProtection;
    if (typeof body.ipv6LeakProtection === "boolean")
      data.ipv6LeakProtection = body.ipv6LeakProtection;
    if (typeof body.splitTunneling === "boolean")
      data.splitTunneling = body.splitTunneling;
    if (typeof body.obfuscation === "boolean") data.obfuscation = body.obfuscation;
    if (typeof body.autoConnect === "boolean") data.autoConnect = body.autoConnect;
    if (typeof body.blockTrackers === "boolean")
      data.blockTrackers = body.blockTrackers;
    if (typeof body.blockAds === "boolean") data.blockAds = body.blockAds;
    if (typeof body.stealthMode === "boolean")
      data.stealthMode = body.stealthMode;
    if (typeof body.preferredRegion === "string")
      data.preferredRegion = body.preferredRegion;
    if (typeof body.mtu === "number") data.mtu = body.mtu;
    if (typeof body.dnsServers === "string") data.dnsServers = body.dnsServers;

    const settings = await db.userSetting.upsert({
      where: { id: "default" },
      update: data,
      create: { id: "default", ...(data as Record<string, unknown>) },
    });
    return NextResponse.json({ settings });
  } catch (err) {
    console.error("[api/settings] PUT failed", err);
    return NextResponse.json(
      { error: "Failed to update settings" },
      { status: 500 }
    );
  }
}
