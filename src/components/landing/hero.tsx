"use client";

import { motion } from "framer-motion";
import { Shield, Globe2, Zap, Lock, Power, ChevronRight, Chrome, Download, Github, Sparkles, Infinity as InfinityIcon, Wifi } from "lucide-react";
import { DistortLogo, DistortWordmark } from "@/components/vpn/distort-logo";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function Hero({ onLaunch }: { onLaunch: () => void }) {
  return (
    <section className="relative overflow-hidden">
      <div className="mesh-bg" />
      <div className="absolute inset-0 grid-overlay opacity-40" />

      <div className="relative z-10 mx-auto max-w-6xl px-4 pt-16 pb-20 md:pt-24 md:pb-28">
        {/* Floating logo */}
        <motion.div
          initial={{ opacity: 0, scale: 0.6, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 80, damping: 14 }}
          className="flex justify-center mb-8"
        >
          <div className="relative">
            <div className="absolute inset-0 blur-3xl bg-brand-gradient opacity-30 rounded-full" />
            <DistortLogo size={120} animate />
          </div>
        </motion.div>

        {/* Tagline pill */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="flex justify-center mb-5"
        >
          <Badge className="bg-[#00f0ff]/10 border-[#00f0ff]/30 text-[#5cf2ff] hover:bg-[#00f0ff]/15 font-tech uppercase tracking-[0.2em] text-[10px] py-1.5 px-3">
            <Sparkles className="w-3 h-3 mr-1.5" /> 100% Free · Open · Iran-Resilient
          </Badge>
        </motion.div>

        {/* Title */}
        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="font-display text-5xl md:text-7xl font-extrabold tracking-tight text-center leading-[1.05]"
        >
          <span className="text-white">Break the</span>
          <br />
          <span className="text-gradient-brand">borders of the web</span>
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="text-center text-base md:text-lg text-muted-foreground max-w-2xl mx-auto mt-6 leading-relaxed"
        >
          DISTORT is a next-generation VPN that stays online when the internet goes dark.
          Multi-protocol, anti-censorship, zero cost — engineered for the moments that matter most.
        </motion.p>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-8"
        >
          <Button onClick={onLaunch} size="lg" className="bg-brand-gradient text-[#02131a] hover:opacity-90 font-tech uppercase tracking-[0.15em] px-8 h-12 group">
            <Power className="w-4 h-4 mr-2 group-hover:rotate-180 transition-transform duration-500" />
            Launch Distort
            <ChevronRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
          </Button>
          <a href="#download" className="w-full sm:w-auto">
            <Button variant="outline" size="lg" className="w-full sm:w-auto border-white/15 bg-white/[0.03] hover:bg-white/[0.06] hover:border-[#00f0ff]/40 font-tech uppercase tracking-[0.15em] h-12">
              <Download className="w-4 h-4 mr-2" /> Get the apps
            </Button>
          </a>
        </motion.div>

        {/* Trust row */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
          className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 mt-10 text-xs text-muted-foreground font-tech uppercase tracking-wider"
        >
          <span className="flex items-center gap-1.5"><InfinityIcon className="w-3.5 h-3.5 text-[#10d9a0]" /> Unlimited bandwidth</span>
          <span className="flex items-center gap-1.5"><Globe2 className="w-3.5 h-3.5 text-[#00f0ff]" /> 30+ countries</span>
          <span className="flex items-center gap-1.5"><Lock className="w-3.5 h-3.5 text-[#8b5cf6]" /> AES-256 / ChaCha20</span>
          <span className="flex items-center gap-1.5"><Shield className="w-3.5 h-3.5 text-[#ffb020]" /> No logs · ever</span>
          <span className="flex items-center gap-1.5"><Wifi className="w-3.5 h-3.5 text-[#5cf2ff]" /> Stealth transports</span>
        </motion.div>

        {/* Floating stat cards */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-12 max-w-4xl mx-auto"
        >
          <StatCard value="10 Gbps" label="Backbone" sub="per node" color="#00f0ff" />
          <StatCard value="5" label="Protocols" sub="incl. stealth" color="#8b5cf6" />
          <StatCard value="0" label="Logs kept" sub="audited" color="#10d9a0" />
          <StatCard value="∞" label="Devices" sub="unlimited" color="#ffb020" />
        </motion.div>

        {/* Marquee of countries */}
        <div className="mt-14 overflow-hidden relative">
          <div className="absolute left-0 top-0 bottom-0 w-24 bg-gradient-to-r from-[#050814] to-transparent z-10" />
          <div className="absolute right-0 top-0 bottom-0 w-24 bg-gradient-to-l from-[#050814] to-transparent z-10" />
          <div className="marquee text-2xl">
            {[...Array(2)].map((_, k) => (
              <div key={k} className="flex items-center gap-12">
                {["🇩🇪","🇳🇱","🇫🇮","🇫🇷","🇨🇭","🇸🇪","🇬🇧","🇺🇸","🇨🇦","🇯🇵","🇸🇬","🇹🇷","🇦🇪","🇮🇳","🇦🇺","🇧🇷","🇿🇦","🇬🇪","🇦🇲","🇮🇸","🇪🇪","🇵🇱","🇦🇹","🇱🇺"].map((f, i) => (
                  <span key={i} className="opacity-60 hover:opacity-100 transition-opacity">{f}</span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function StatCard({ value, label, sub, color }: { value: string; label: string; sub: string; color: string }) {
  return (
    <div className="glass rounded-2xl p-4 text-center relative overflow-hidden">
      <div className="absolute inset-0 opacity-20" style={{ background: `radial-gradient(circle at top, ${color}, transparent 70%)` }} />
      <div className="relative">
        <div className="font-display text-3xl font-extrabold" style={{ color }}>{value}</div>
        <div className="text-xs font-tech uppercase tracking-wider text-white mt-1">{label}</div>
        <div className="text-[10px] text-muted-foreground">{sub}</div>
      </div>
    </div>
  );
}
