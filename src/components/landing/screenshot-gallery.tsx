"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Images, X, ChevronLeft, ChevronRight, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type Shot = {
  src: string;
  title: string;
  desc: string;
  category: "Landing" | "Dashboard" | "Mesh" | "More";
};

const SHOTS: Shot[] = [
  { src: "/screenshots/SCREENSHOT-01-landing.png", title: "Landing — Hero", desc: "Logo, tagline, headline 'Break the borders of the web', Launch CTA", category: "Landing" },
  { src: "/screenshots/SCREENSHOT-02-landing-full.png", title: "Landing — Full page", desc: "Complete landing page with hero, stats, marquee", category: "Landing" },
  { src: "/screenshots/SCREENSHOT-03-features.png", title: "Features Section", desc: "9 feature cards + Iran-resilience protocol ladder", category: "Landing" },
  { src: "/screenshots/SCREENSHOT-04-servers-cta.png", title: "Servers CTA", desc: "'Pick your exit. Anywhere on Earth.' section", category: "Landing" },
  { src: "/screenshots/SCREENSHOT-05-download.png", title: "Download Section", desc: "Chrome Extension, Desktop App, Mobile Apps cards", category: "Landing" },
  { src: "/screenshots/SCREENSHOT-06-dashboard-connect.png", title: "Dashboard — Connect", desc: "Power button, climate indicator, server card", category: "Dashboard" },
  { src: "/screenshots/SCREENSHOT-07-connect-full.png", title: "Connect — Full view", desc: "Big power button with pulse rings, quick toggles", category: "Dashboard" },
  { src: "/screenshots/SCREENSHOT-08-servers-list.png", title: "Servers List", desc: "29 nodes with flag, ping, load, stealth badge", category: "Dashboard" },
  { src: "/screenshots/SCREENSHOT-09-servers-full.png", title: "Servers — Full list", desc: "Search, filters (All/Stealth/Premium)", category: "Dashboard" },
  { src: "/screenshots/SCREENSHOT-10-connected.png", title: "Connected State", desc: "Power button glowing cyan, Frankfurt selected", category: "Dashboard" },
  { src: "/screenshots/SCREENSHOT-11-connected-live.png", title: "Connected — Live Metrics", desc: "Download/upload speed, session time, data used", category: "Dashboard" },
  { src: "/screenshots/SCREENSHOT-12-community-mesh.png", title: "Community Mesh", desc: "Iran Config Collector subscription, 241 configs", category: "Mesh" },
  { src: "/screenshots/SCREENSHOT-13-mesh-list.png", title: "Mesh — Optimized configs", desc: "216 Reality/TLS/Vision configs, score & reach", category: "Mesh" },
  { src: "/screenshots/SCREENSHOT-14-speedtest.png", title: "Speed Test", desc: "Animated gauge, download/upload/ping/jitter", category: "More" },
  { src: "/screenshots/SCREENSHOT-15-stats.png", title: "Statistics", desc: "KPI cards + area/pie/bar charts", category: "More" },
  { src: "/screenshots/SCREENSHOT-16-settings.png", title: "Settings", desc: "Protocol cards, security & anti-censor toggles", category: "More" },
  { src: "/screenshots/SCREENSHOT-17-account.png", title: "Account", desc: "Free account, config generator, referral", category: "More" },
  { src: "/screenshots/SCREENSHOT-18-account-configs.png", title: "Account — Downloads", desc: "Chrome/Desktop/Mobile download cards", category: "More" },
];

const CATEGORIES = ["All", "Landing", "Dashboard", "Mesh", "More"] as const;

export function ScreenshotGallery({ onClose }: { onClose?: () => void }) {
  const [filter, setFilter] = useState<(typeof CATEGORIES)[number]>("All");
  const [active, setActive] = useState<number | null>(null);

  const filtered = filter === "All" ? SHOTS : SHOTS.filter((s) => s.category === filter);

  const next = () => setActive((i) => (i === null ? 0 : (i + 1) % filtered.length));
  const prev = () => setActive((i) => (i === null ? 0 : (i - 1 + filtered.length) % filtered.length));

  return (
    <section id="showcase" className="relative py-16 px-4">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="text-center mb-10">
          <Badge className="bg-[#00f0ff]/10 border-[#00f0ff]/30 text-[#5cf2ff] hover:bg-[#00f0ff]/15 font-tech uppercase tracking-[0.2em] text-[10px] py-1.5 px-3 mb-4">
            <Eye className="w-3 h-3 mr-1.5" /> Live Preview
          </Badge>
          <h2 className="font-display text-4xl md:text-5xl font-extrabold tracking-tight">
            See <span className="text-gradient-brand">Distort</span> in action
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto mt-4">
            18 screenshots of the full app — landing page, dashboard, community mesh, and more.
            Click any image to view it full-size.
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center justify-center gap-2 mb-8">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setFilter(c)}
              className={`px-3 py-1.5 rounded-lg text-xs font-tech uppercase tracking-wider transition-colors border ${
                filter === c
                  ? "bg-[#00f0ff]/10 border-[#00f0ff]/40 text-[#5cf2ff]"
                  : "bg-white/[0.02] border-white/5 text-muted-foreground hover:text-white"
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((s, i) => (
            <motion.button
              key={s.src}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ delay: Math.min(i * 0.04, 0.3) }}
              onClick={() => setActive(i)}
              className="group text-left rounded-2xl overflow-hidden glass border-white/5 hover:border-[#00f0ff]/40 transition-all"
            >
              <div className="relative aspect-video bg-[#050814] overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={s.src}
                  alt={s.title}
                  className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-500"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#050814] via-transparent to-transparent opacity-60" />
                <div className="absolute top-2 right-2">
                  <span className="text-[9px] font-tech uppercase tracking-wider px-1.5 py-0.5 rounded border border-[#00f0ff]/30 text-[#5cf2ff] bg-[#050814]/80 backdrop-blur">
                    {s.category}
                  </span>
                </div>
              </div>
              <div className="p-3">
                <h3 className="font-display font-bold text-sm text-white mb-0.5">{s.title}</h3>
                <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">{s.desc}</p>
              </div>
            </motion.button>
          ))}
        </div>

        {/* Lightbox */}
        <AnimatePresence>
          {active !== null && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-[#050814]/95 backdrop-blur-xl flex items-center justify-center p-4"
              onClick={() => setActive(null)}
            >
              <button
                onClick={(e) => { e.stopPropagation(); setActive(null); }}
                className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white"
              >
                <X className="w-5 h-5" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); prev(); }}
                className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); next(); }}
                className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
              <motion.div
                key={active}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="max-w-5xl w-full"
                onClick={(e) => e.stopPropagation()}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={filtered[active].src}
                  alt={filtered[active].title}
                  className="w-full rounded-2xl border border-white/10"
                />
                <div className="text-center mt-4">
                  <h3 className="font-display text-lg font-bold text-white">{filtered[active].title}</h3>
                  <p className="text-sm text-muted-foreground mt-1">{filtered[active].desc}</p>
                  <p className="text-[11px] text-muted-foreground/60 mt-2 font-tech uppercase tracking-wider">
                    {active + 1} / {filtered.length}
                  </p>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* CTA */}
        <div className="text-center mt-12">
          {onClose ? (
            <Button onClick={onClose} variant="outline" className="border-[#00f0ff]/30 text-[#5cf2ff] hover:bg-[#00f0ff]/10 font-tech uppercase tracking-wider">
              <Images className="w-4 h-4 mr-2" /> Back to home
            </Button>
          ) : (
            <a href="#download">
              <Button size="lg" className="bg-brand-gradient text-[#02131a] hover:opacity-90 font-tech uppercase tracking-[0.15em] px-8 h-12">
                Get Distort
              </Button>
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
