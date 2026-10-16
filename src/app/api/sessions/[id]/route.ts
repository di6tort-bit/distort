// DISTORT — /api/sessions/[id]
// GET   : single session with server relation.
// PATCH : { status?, bytesDown?, bytesUp?, durationSec? } -> update; if status
//         becomes "disconnected", set endedAt = now.
// DELETE: end session (set status disconnected, endedAt now).

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await db.session.findUnique({
      where: { id },
      include: { server: true },
    });
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    return NextResponse.json({ session });
  } catch (err) {
    console.error("[api/sessions/[id]] GET failed", err);
    return NextResponse.json(
      { error: "Failed to load session" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));

    const existing = await db.session.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const data: Record<string, unknown> = {};
    if (typeof body.status === "string") data.status = body.status;
    if (typeof body.bytesDown === "number") data.bytesDown = body.bytesDown;
    if (typeof body.bytesUp === "number") data.bytesUp = body.bytesUp;
    if (typeof body.durationSec === "number") data.durationSec = body.durationSec;

    // Transitioning to disconnected ends the session.
    if (body.status === "disconnected" && !existing.endedAt) {
      data.endedAt = new Date();
    }

    const session = await db.session.update({
      where: { id },
      data,
      include: { server: true },
    });
    return NextResponse.json({ session });
  } catch (err) {
    console.error("[api/sessions/[id]] PATCH failed", err);
    return NextResponse.json(
      { error: "Failed to update session" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const existing = await db.session.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    const session = await db.session.update({
      where: { id },
      data: { status: "disconnected", endedAt: new Date() },
      include: { server: true },
    });
    return NextResponse.json({ session });
  } catch (err) {
    console.error("[api/sessions/[id]] DELETE failed", err);
    return NextResponse.json(
      { error: "Failed to end session" },
      { status: 500 }
    );
  }
}
