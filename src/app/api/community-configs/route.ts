// DISTORT — /api/community-configs
// GET : list all CommunityConfig rows.
// POST: { protocol, uri, country?, note? } -> create a row.
//
// PROTECTED: These configs may contain UUIDs/passwords. Requires authentication
// if DISTORT_API_KEY env var is set.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkAuth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const authFail = checkAuth(req);
  if (authFail) return authFail;
  try {
    const configs = await db.communityConfig.findMany({
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ configs });
  } catch (err) {
    console.error("[api/community-configs] GET failed", err);
    return NextResponse.json(
      { error: "Failed to load community configs" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const authFail = checkAuth(req);
  if (authFail) return authFail;
  try {
    const body = await req.json().catch(() => ({}));
    const protocol = String(body?.protocol || "");
    const uri = String(body?.uri || "");
    const country = body?.country ? String(body.country) : null;
    const note = body?.note ? String(body.note) : null;

    if (!protocol || !uri) {
      return NextResponse.json(
        { error: "protocol and uri are required" },
        { status: 400 }
      );
    }

    const config = await db.communityConfig.create({
      data: { protocol, uri, country, note },
    });
    return NextResponse.json({ config }, { status: 201 });
  } catch (err) {
    console.error("[api/community-configs] POST failed", err);
    return NextResponse.json(
      { error: "Failed to create community config" },
      { status: 500 }
    );
  }
}
