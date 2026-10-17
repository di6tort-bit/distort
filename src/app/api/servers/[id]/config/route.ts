// DISTORT — /api/servers/[id]/config
// GET  ?protocol=wireguard&userTag=distort-free  -> generate config
// POST { protocol, userTag? }                    -> generate config
//
// Returns a TEMPLATE config (connectable: false). The response shape extends
// the legacy { filename, mime, content } with the new GeneratedConfig fields
// (connectable, source, warning, label, protocol, country) so the UI can
// surface a "NOT CONNECTABLE — sample credentials" warning to the user.
//
// For REAL connectable configs, see the Community Mesh tab or the (stub)
// provisionConfig path — both surfaces are intentionally separate from this
// template path.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  generateTemplateConfig,
  type GeneratedConfig,
  type Protocol,
} from "@/lib/config-generator";

const VALID: Protocol[] = ["wireguard", "v2ray", "trojan", "shadowsocks", "ssh"];

// Filename + mime derivation for the legacy response shape consumers.
const MIME_BY_PROTOCOL: Record<Protocol, { filename: (code: string) => string; mime: string }> = {
  wireguard: { filename: (c) => `distort-${c}.conf`, mime: "text/plain" },
  v2ray: { filename: (c) => `distort-${c}-v2ray.json`, mime: "application/json" },
  trojan: { filename: (c) => `distort-${c}-trojan.json`, mime: "application/json" },
  shadowsocks: { filename: (c) => `distort-${c}-shadowsocks.json`, mime: "application/json" },
  ssh: { filename: (c) => `distort-${c}-ssh.conf`, mime: "text/plain" },
};

// The full response shape — legacy fields + new GeneratedConfig fields, so the
// UI can render the "NOT CONNECTABLE" warning even though older code only
// reads { filename, mime, content }.
type ConfigResponse = {
  // legacy fields (still consumed by AccountView's download/copy code)
  filename: string;
  mime: string;
  content: string;
  // new GeneratedConfig fields (for the UI's labelling/warning surface)
  connectable: GeneratedConfig["connectable"];
  source: GeneratedConfig["source"];
  warning: GeneratedConfig["warning"];
  label: GeneratedConfig["label"];
  protocol: GeneratedConfig["protocol"];
  country?: GeneratedConfig["country"];
};

async function buildConfig(id: string, protocol: string): Promise<NextResponse> {
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

  const p = protocol as Protocol;
  // generateTemplateConfig ALWAYS returns connectable:false + source:"template"
  // with a TEMPLATE_WARNING — this is the template path, not the provisioned path.
  const tpl = generateTemplateConfig(p, {
    code: server.code,
    country: server.country,
    city: server.city ?? "",
    host: server.host,
    port: server.port,
  });
  const mm = MIME_BY_PROTOCOL[p];
  const response: ConfigResponse = {
    filename: mm.filename(server.code),
    mime: mm.mime,
    content: tpl.content,
    connectable: tpl.connectable,
    source: tpl.source,
    warning: tpl.warning,
    label: tpl.label,
    protocol: tpl.protocol,
    country: tpl.country,
  };

  try {
    await db.vpnConfig.create({
      data: {
        label: `${server.code}-${protocol}`,
        protocol,
        content: tpl.content,
        // Persisted source reflects the actual provenance: this is a TEMPLATE
        // (sample credentials, not connectable). The previous "distort" tag
        // was misleading because it implied a real Distort-issued config.
        source: "template",
        country: server.country,
      },
    });
  } catch (err) {
    // Persistence failure shouldn't break the response — log and continue.
    console.error("[api/servers/[id]/config] failed to persist VpnConfig", err);
  }

  return NextResponse.json(response);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const protocol = searchParams.get("protocol") || "wireguard";
    return await buildConfig(id, protocol);
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
    return await buildConfig(id, protocol);
  } catch (err) {
    console.error("[api/servers/[id]/config] POST failed", err);
    return NextResponse.json({ error: "Failed to generate config" }, { status: 500 });
  }
}
