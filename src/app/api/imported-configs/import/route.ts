// DISTORT — /api/imported-configs/import
// POST: accept raw text (vmess://, vless://, trojan://, ss:// lines) OR a single URI,
// parse and persist. Body: { raw: string, source?: string }

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { importRawConfigs } from "@/lib/subscription-fetcher";
import { parseConfigUri } from "@/lib/config-parser";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const raw = body?.raw;
    const source = body?.source ?? "manual";

    if (!raw || typeof raw !== "string") {
      return NextResponse.json({ error: "raw (string) is required" }, { status: 400 });
    }

    // Single URI fast-path: if it's one line and looks like a known scheme,
    // import just that one as a favorite.
    const trimmed = raw.trim();
    const lines = trimmed.split(/\r?\n/).filter(Boolean);

    if (lines.length === 1) {
      const parsed = parseConfigUri(lines[0]);
      if (!parsed) {
        return NextResponse.json({ error: "Could not parse the provided URI" }, { status: 400 });
      }
      let sub = await db.subscription.findFirst({ where: { kind: "manual", label: source } });
      if (!sub) {
        sub = await db.subscription.create({
          data: { label: source, url: "manual://paste", kind: "manual", intervalMin: 0, enabled: false },
        });
      }
      const created = await db.importedConfig.create({
        data: {
          subscriptionId: sub.id,
          protocol: parsed.protocol,
          uri: parsed.raw,
          label: parsed.label ?? null,
          host: parsed.host,
          port: parsed.port,
          network: parsed.network,
          security: parsed.security,
          sni: parsed.sni ?? null,
          path: parsed.path ?? null,
          hostHeader: parsed.hostHeader ?? null,
          flow: parsed.flow ?? null,
          country: parsed.country ?? null,
          score: parsed.score,
          flags: parsed.flags.join(","),
          bucket: parsed.score >= 55 ? "optimized" : "all",
          favorite: true,
        },
      });
      return NextResponse.json({ ok: true, count: 1, config: created }, { status: 201 });
    }

    // Multi-line: bulk import
    const count = await importRawConfigs(raw, source);
    return NextResponse.json({ ok: true, count }, { status: 201 });
  } catch (err) {
    console.error("[api/imported-configs/import] POST failed", err);
    return NextResponse.json({ error: "Import failed" }, { status: 500 });
  }
}
