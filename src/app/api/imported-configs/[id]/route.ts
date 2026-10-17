// DISTORT — /api/imported-configs/[id]
// PATCH: toggle favorite, update reach
// DELETE: remove a single imported config
// PROTECTED: requires API key (modifies/deletes config data)

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkAuth } from "@/lib/auth";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authFail = checkAuth(req);
  if (authFail) return authFail;
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

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authFail = checkAuth(req);
  if (authFail) return authFail;
  try {
    const { id } = await params;
    await db.importedConfig.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/imported-configs/[id]] DELETE failed", err);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
