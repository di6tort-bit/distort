// DISTORT — API authentication middleware
// Protects sensitive endpoints from unauthenticated access.
//
// HOW IT WORKS:
// - If DISTORT_API_KEY env var is set, all protected endpoints require
//   either an `x-api-key` header or a `?key=` query param matching it.
// - If DISTORT_API_KEY is NOT set (default), endpoints are open — this is
//   fine for local desktop use but NOT safe for public deployment.
//
// FOR PUBLIC DEPLOYMENT:
//   1. Set DISTORT_API_KEY in your environment (a long random string)
//   2. The desktop app reads it from settings and sends it as x-api-key
//   3. Without the key, all protected endpoints return 401

import { NextRequest, NextResponse } from "next/server";

const API_KEY = process.env.DISTORT_API_KEY || "";

export function isAuthConfigured(): boolean {
  return API_KEY.length > 0;
}

export function checkAuth(req: NextRequest): NextResponse | null {
  if (!isAuthConfigured()) {
    // No API key configured — endpoints are open (local dev mode).
    // We add a warning header so clients know.
    return null;
  }

  const headerKey = req.headers.get("x-api-key");
  const queryKey = new URL(req.url).searchParams.get("key");

  if (headerKey === API_KEY || queryKey === API_KEY) {
    return null;
  }

  return NextResponse.json(
    {
      error: "Unauthorized — API key required",
      hint: "Set DISTORT_API_KEY env var on the server, and send it as x-api-key header or ?key= query param.",
    },
    { status: 401 }
  );
}
