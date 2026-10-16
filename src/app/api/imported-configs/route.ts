// DISTORT — /api/imported-configs
// GET: list imported configs (filterable by bucket / protocol / favorite)
// DELETE: clear all (or by subscriptionId)

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const bucket = url.searchParams.get("bucket"); // "optimized" | "all"
    const protocol = url.searchParams.get("protocol");
    const favorite = url.searchParams.get("favorite");
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 200), 500);
    const q = url.searchParams.get("q")?.trim();

    const where: Record<string, unknown> = {};
    if (bucket) where.bucket = bucket;
    if (protocol) where.protocol = protocol;
    if (favorite === "1") where.favorite = true;
    if (q) {
      where.OR = [
        { host: { contains: q } },
        { label: { contains: q } },
        { country: { contains: q } },
        { sni: { contains: q } },
      ];
    }

    const configs = await db.importedConfig.findMany({
      where,
      orderBy: [{ favorite: "desc" }, { score: "desc" }, { host: "asc" }],
      take: limit,
      include: { subscription: { select: { label: true, kind: true } } },
    });
    return NextResponse.json({ configs, count: configs.length });
  } catch (err) {
    console.error("[api/imported-configs] GET failed", err);
    return NextResponse.json({ error: "Failed to list imported configs" }, { status: 500 });
  }
}
