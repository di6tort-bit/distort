"use client";

import { motion } from "framer-motion";
import { Chrome, Monitor, Smartphone, FileCode2, Download, Terminal, Github, Heart, ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function DownloadSection({ onLaunch }: { onLaunch: () => void }) {
  return (
    <section id="download" className="relative py-20 px-4">
      <div className="mx-auto max-w-6xl">
        <div className="text-center mb-12">
          <Badge className="bg-[#00f0ff]/10 border-[#00f0ff]/30 text-[#5cf2ff] hover:bg-[#00f0ff]/15 font-tech uppercase tracking-[0.2em] text-[10px] py-1.5 px-3 mb-4">
            <Download className="w-3 h-3 mr-1.5" /> Get Distort
          </Badge>
          <h2 className="font-display text-4xl md:text-5xl font-extrabold tracking-tight">
            One account. <span className="text-gradient-brand">Every device.</span>
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto mt-4">
            100% free, forever. No data caps, no speed throttling, no email required to connect.
            Pick the client that fits — or use the web dashboard right now.
          </p>
        </div>

        {/* Big cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <PlatformCard
            icon={<Chrome className="w-7 h-7" />}
            title="Chrome Extension"
            desc="Browser-level proxy with the full Distort stealth stack. MV3, no system changes."
            version="v1.0.0 · MV3"
            color="#00f0ff"
            primary
            cta="Load unpacked"
            badge="Recommended"
          />
          <PlatformCard
            icon={<Monitor className="w-7 h-7" />}
            title="Windows App"
            desc="Full Electron desktop app with bundled xray-core engine. Real VPN tunneling on Windows."
            version="v1.0.0 · 136MB"
            color="#8b5cf6"
            cta="Download .zip"
            href="/DISTORT-Windows-1.0.0.zip"
            download
            badge="✓ Ready"
          />
          <PlatformCard
            icon={<Smartphone className="w-7 h-7" />}
            title="Android Project"
            desc="Native Kotlin app with VpnService + xray-core. Complete Gradle project, ready to build APK."
            version="v1.0.0 · 20KB"
            color="#ffb020"
            cta="Download .zip"
            href="/DISTORT-Android-1.0.0.zip"
            download
            badge="Source"
          />
        </div>

        {/* Full source bundle */}
        <Card className="glass-strong border-[#00f0ff]/20 mb-8 overflow-hidden">
          <CardContent className="p-6 flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left">
            <div className="w-14 h-14 rounded-2xl bg-brand-gradient-soft border border-white/10 flex items-center justify-center text-[#5cf2ff]">
              <Download className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <h3 className="font-display text-lg font-bold text-white">Full Source Code Bundle</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Everything in one zip: web app, Chrome extension, desktop (Electron + xray-core), Android, docs, GitHub Actions.
                21MB · MIT licensed.
              </p>
            </div>
            <a href="/DISTORT-FullSource-1.0.0.zip" download>
              <Button className="bg-brand-gradient text-[#02131a] hover:opacity-90 font-tech uppercase tracking-wider">
                <Download className="w-4 h-4 mr-2" /> Download All (21MB)
              </Button>
            </a>
          </CardContent>
        </Card>

        {/* Quick config / web */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="glass border-white/5 overflow-hidden">
            <CardContent className="p-6">
              <div className="flex items-center gap-2 mb-3">
                <FileCode2 className="w-5 h-5 text-[#10d9a0]" />
                <h3 className="font-display text-lg font-bold text-white">Manual Configs</h3>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                Generate ready-to-paste configs for your existing WireGuard, V2Ray, Trojan, Shadowsocks or SSH clients.
                Perfect for routers, NAS, or any device where you can't install the app.
              </p>
              <Button onClick={onLaunch} variant="outline" className="border-[#10d9a0]/30 text-[#10d9a0] hover:bg-[#10d9a0]/10 font-tech uppercase tracking-wider">
                <Terminal className="w-4 h-4 mr-2" /> Generate a config
              </Button>
            </CardContent>
          </Card>

          <Card className="glass border-white/5 overflow-hidden">
            <CardContent className="p-6">
              <div className="flex items-center gap-2 mb-3">
                <Github className="w-5 h-5 text-[#8b5cf6]" />
                <h3 className="font-display text-lg font-bold text-white">Open Source</h3>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                Distort is community-driven and 100% free. Audit the code, run your own relay, contribute transports.
                Freedom software, built in the open.
              </p>
              <div className="flex gap-2">
                <a href="https://github.com/di6tort-bit/distort" target="_blank" rel="noreferrer">
                  <Button variant="outline" className="border-[#8b5cf6]/30 text-[#a78bfa] hover:bg-[#8b5cf6]/10 font-tech uppercase tracking-wider">
                    <Github className="w-4 h-4 mr-2" /> View on GitHub
                  </Button>
                </a>
                <Button onClick={onLaunch} className="bg-brand-gradient text-[#02131a] hover:opacity-90 font-tech uppercase tracking-wider">
                  Launch web app <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Support banner */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mt-8"
        >
          <Card className="glass-strong border-[#ff4d6d]/20 overflow-hidden">
            <CardContent className="p-6 flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left">
              <div className="w-14 h-14 rounded-2xl bg-[#ff4d6d]/15 border border-[#ff4d6d]/30 flex items-center justify-center">
                <Heart className="w-6 h-6 text-[#ff4d6d]" />
              </div>
              <div className="flex-1">
                <h3 className="font-display text-lg font-bold text-white">Distort is &amp; will remain free</h3>
                <p className="text-sm text-muted-foreground">
                  No paywalls, no data selling, no premium tier that gates your freedom. If you want to help,
                  star the repo, run a relay, or tell a friend behind a firewall.
                </p>
              </div>
              <a href="https://github.com/di6tort-bit/distort" target="_blank" rel="noreferrer">
                <Button variant="outline" className="border-[#ff4d6d]/30 text-[#ff4d6d] hover:bg-[#ff4d6d]/10 font-tech uppercase tracking-wider whitespace-nowrap">
                  <Heart className="w-4 h-4 mr-2" /> Support us
                </Button>
              </a>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </section>
  );
}

function PlatformCard({
  icon, title, desc, version, color, primary, cta, badge, href, download,
}: { icon: React.ReactNode; title: string; desc: string; version: string; color: string; primary?: boolean; cta: string; badge?: string; href?: string; download?: boolean }) {
  const content = (
    <Card className={`glass border-white/5 ${primary ? "ring-glow" : ""} hover:border-white/15 transition-colors h-full`}>
      <CardContent className="p-6 flex flex-col h-full">
        <div className="flex items-center justify-between mb-4">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center border border-white/10" style={{ background: `${color}1a`, color }}>
            {icon}
          </div>
          {badge && <Badge className="bg-brand-gradient text-[#02131a] font-tech uppercase tracking-wider text-[10px]">{badge}</Badge>}
        </div>
        <h3 className="font-display text-xl font-bold text-white mb-1">{title}</h3>
        <p className="text-sm text-muted-foreground mb-3 flex-1">{desc}</p>
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono text-muted-foreground">{version}</span>
          <Button size="sm" className="bg-white/[0.04] border border-white/10 hover:bg-white/[0.08] text-white font-tech uppercase tracking-wider">
            <Download className="w-3.5 h-3.5 mr-1.5" /> {cta}
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  if (href) {
    return (
      <a href={href} download={download} target={download ? undefined : "_blank"} rel="noreferrer" className="group block">
        {content}
      </a>
    );
  }
  return content;
}
