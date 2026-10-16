// DISTORT — /api/imported-configs/[id]
// PATCH: toggle favorite, update reach
// DELETE: remove a single imported config

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const patch: Record<string, unknown> = {};
    if (typeof body.favorite === "boolean") patch.favorite = body.favorite;
    if (typeof body.reach === "string") patch.reach = body.reach;
    if (typeof body.latencyMs === "number") patch.latencyMs = body.latencyMs;
    if (typeof body.bucket === "string") patch.bucket = body.bucket;
    patch.checkedAt = new Date();

    const updated = await db.importedConfig.update({ where: { id }, data: patch });
    return NextResponse.json({ config: updated });
  } catch (err) {
    console.error("[api/imported-configs/[id]] PATCH failed", err);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await db.importedConfig.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/imported-configs/[id]] DELETE failed", err);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
