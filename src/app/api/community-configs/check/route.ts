// DISTORT — /api/community-configs/check
// POST: probe every community config, update reach + checkedAt, return list.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { probeReachability } from "@/lib/anti-censor";

// Parse host:port out of the various VPN URI schemes (trojan/vless/vmess/ss).
function parseHostPort(uri: string): { host: string; port: number } | null {
  try {
    // vmess://<base64-json>
    if (uri.startsWith("vmess://")) {
      const b64 = uri.slice("vmess://".length).split("#")[0].trim();
      const json = Buffer.from(b64, "base64").toString("utf-8");
      const obj = JSON.parse(json);
      const host = String(obj.add || "").trim();
      const port = Number(obj.port);
      if (host && Number.isFinite(port) && port > 0) return { host, port };
      return null;
    }

    // ss://<base64(method:password)>@host:port[?...]#frag
    // OR ss://<base64(method:password@host:port)>[?...]#frag
    if (uri.startsWith("ss://")) {
      const rest = uri.slice("ss://".length);
      const atIdx = rest.indexOf("@");
      if (atIdx >= 0) {
        const after = rest.slice(atIdx + 1);
        const hp = after.split(/[/?#]/)[0];
        const parsed = splitHostPort(hp);
        if (parsed) return parsed;
      } else {
        // everything is base64-encoded
        const b64 = rest.split(/[/?#]/)[0];
        const decoded = Buffer.from(b64, "base64").toString("utf-8");
        // decoded looks like "method:password@host:port"
        const atIdx2 = decoded.indexOf("@");
        if (atIdx2 >= 0) {
          const parsed = splitHostPort(decoded.slice(atIdx2 + 1));
          if (parsed) return parsed;
        }
      }
      return null;
    }

    // trojan://secret@host:port?...#frag  /  vless://uuid@host:port?...#frag
    const m = uri.match(/^[a-z]+:\/\/[^/@]+@([^/?#]+)(?:\?|#|$)/i);
    if (m) {
      const parsed = splitHostPort(m[1]);
      if (parsed) return parsed;
    }

    // Fallback: bare host:port
    const bare = uri.split(/[/?#]/)[0];
    const parsed = splitHostPort(bare);
    return parsed;
  } catch {
    return null;
  }
}

function splitHostPort(s: string): { host: string; port: number } | null {
  const idx = s.lastIndexOf(":");
  if (idx < 0) return null;
  const host = s.slice(0, idx).replace(/^\[/, "").replace(/\]$/, "").trim();
  const port = Number(s.slice(idx + 1));
  if (!host || !Number.isFinite(port) || port <= 0 || port > 65535) return null;
  return { host, port };
}

export async function POST() {
  try {
    const configs = await db.communityConfig.findMany();

    const probed = await Promise.all(
      configs.map(async (c) => {
        const hp = parseHostPort(c.uri);
        if (!hp) {
          const updated = await db.communityConfig.update({
            where: { id: c.id },
            data: { reach: "invalid-uri", checkedAt: new Date() },
          });
          return {
            id: c.id,
            protocol: c.protocol,
            uri: c.uri,
            host: null,
            port: null,
            ok: false,
            latencyMs: 0,
            reach: updated.reach,
          };
        }
        const r = await probeReachability(hp.host, hp.port);
        const reach = r.ok ? "reachable" : "unreachable";
        const updated = await db.communityConfig.update({
          where: { id: c.id },
          data: { reach, checkedAt: new Date() },
        });
        return {
          id: c.id,
          protocol: c.protocol,
          uri: c.uri,
          host: hp.host,
          port: hp.port,
          ok: r.ok,
          latencyMs: r.latencyMs,
          reach: updated.reach,
        };
      })
    );

    return NextResponse.json({ results: probed });
  } catch (err) {
    console.error("[api/community-configs/check] POST failed", err);
    return NextResponse.json(
      { error: "Community reachability check failed" },
      { status: 500 }
    );
  }
}
