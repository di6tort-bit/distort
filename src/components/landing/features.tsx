"use client";

import { motion } from "framer-motion";
import { Shield, Eye, Zap, Globe2, Lock, Radio, Skull, Wifi, Network, GitBranch, Cpu, CloudOff } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const FEATURES = [
  {
    icon: <Shield className="w-5 h-5" />,
    title: "Anti-Censorship Engine",
    desc: "Multi-protocol ladder automatically climbs from WireGuard → V2Ray-WS-TLS → Trojan → Shadowsocks → SSH until a working transport is found.",
    color: "#00f0ff",
    tag: "Iran-resilient",
  },
  {
    icon: <Eye className="w-5 h-5" />,
    title: "Stealth Transports",
    desc: "Disguise VPN traffic as ordinary HTTPS. CDN-fronted entries and pluggable transports defeat DPI and SNI inspection.",
    color: "#8b5cf6",
    tag: "DPI bypass",
  },
  {
    icon: <Skull className="w-5 h-5" />,
    title: "Kill Switch",
    desc: "If the tunnel drops, all traffic is instantly blocked. Your real IP never leaks — even for a millisecond.",
    color: "#ff4d6d",
    tag: "Leak-proof",
  },
  {
    icon: <Lock className="w-5 h-5" />,
    title: "DNS & IPv6 Protection",
    desc: "All DNS is forced through the tunnel. IPv6 is disabled on demand to prevent dual-stack leaks.",
    color: "#10d9a0",
    tag: "Hardened",
  },
  {
    icon: <Zap className="w-5 h-5" />,
    title: "10Gbps Backbone",
    desc: "Premium nodes push 10–20 Gbps with sub-20ms latency to most of Europe and the Middle East.",
    color: "#ffb020",
    tag: "Fast",
  },
  {
    icon: <Globe2 className="w-5 h-5" />,
    title: "30+ Countries",
    desc: "Strategically placed nodes — including neighbors like Turkey, UAE, Georgia and Armenia for low-latency access from Iran.",
    color: "#5cf2ff",
    tag: "Global mesh",
  },
  {
    icon: <CloudOff className="w-5 h-5" />,
    title: "Zero Logs",
    desc: "RAM-only nodes, no persistent logs, no account required to connect. Privacy by architecture, not policy.",
    color: "#10d9a0",
    tag: "Audited design",
  },
  {
    icon: <Network className="w-5 h-5" />,
    title: "Split Tunneling",
    desc: "Route only selected apps through the tunnel. Keep local banking direct while everything else stays private.",
    color: "#8b5cf6",
    tag: "Granular",
  },
  {
    icon: <Radio className="w-5 h-5" />,
    title: "Chrome Extension",
    desc: "Browser-level proxy that routes only your browsing — no system-wide changes, instant on/off.",
    color: "#00f0ff",
    tag: "MV3",
  },
];

export function Features() {
  return (
    <section id="features" className="relative py-20 px-4">
      <div className="mx-auto max-w-6xl">
        <div className="text-center mb-12">
          <Badge className="bg-[#8b5cf6]/10 border-[#8b5cf6]/30 text-[#a78bfa] hover:bg-[#8b5cf6]/15 font-tech uppercase tracking-[0.2em] text-[10px] py-1.5 px-3 mb-4">
            <Cpu className="w-3 h-3 mr-1.5" /> Engineered for hostile networks
          </Badge>
          <h2 className="font-display text-4xl md:text-5xl font-extrabold tracking-tight">
            Built for the <span className="text-gradient-brand">darkest days</span>
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto mt-4">
            When the national intranet switches on, most VPNs die. Distort was built from the ground up
            to keep routing around censorship — protocol by protocol, node by node.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ delay: Math.min(i * 0.06, 0.4) }}
            >
              <Card className="glass border-white/5 hover:border-white/15 transition-colors h-full group">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-4">
                    <div
                      className="w-11 h-11 rounded-xl flex items-center justify-center border border-white/10"
                      style={{ background: `${f.color}1a`, color: f.color }}
                    >
                      {f.icon}
                    </div>
                    <Badge variant="outline" className="border-white/10 text-muted-foreground font-tech uppercase tracking-wider text-[9px]">
                      {f.tag}
                    </Badge>
                  </div>
                  <h3 className="font-display font-bold text-white text-lg mb-1.5">{f.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Protocol ladder */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          className="mt-12"
        >
          <Card className="glass border-white/5 overflow-hidden">
            <CardContent className="p-6 md:p-8">
              <div className="flex items-center gap-2 mb-6">
                <GitBranch className="w-5 h-5 text-[#00f0ff]" />
                <h3 className="font-display text-xl font-bold text-white">The Iran-Resilience Ladder</h3>
              </div>
              <p className="text-sm text-muted-foreground mb-6 max-w-2xl">
                When a transport gets blocked, Distort doesn't give up. It climbs the ladder automatically,
                trying the next protocol until your traffic flows again.
              </p>
              <div className="flex flex-col md:flex-row items-stretch gap-2">
                {[
                  { p: "WireGuard", note: "Fastest — works on open internet", color: "#10d9a0" },
                  { p: "V2Ray (VMess)", note: "WS+TLS disguise", color: "#00f0ff" },
                  { p: "Trojan", note: "Looks like normal HTTPS", color: "#5cf2ff" },
                  { p: "Shadowsocks", note: "AEAD SOCKS5", color: "#8b5cf6" },
                  { p: "SSH Tunnel", note: "Last-resort fallback", color: "#ffb020" },
                ].map((step, i, arr) => (
                  <div key={step.p} className="flex items-center gap-2 flex-1">
                    <div className="flex-1 rounded-xl border border-white/5 bg-white/[0.02] p-3 text-center">
                      <div className="font-display font-bold text-sm" style={{ color: step.color }}>{step.p}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">{step.note}</div>
                    </div>
                    {i < arr.length - 1 && <Wifi className="w-4 h-4 text-muted-foreground/50 shrink-0 hidden md:block rotate-90" />}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </section>
  );
}
