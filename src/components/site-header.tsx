"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Power, Github, Menu, X } from "lucide-react";
import { DistortWordmark } from "@/components/vpn/distort-logo";
import { Button } from "@/components/ui/button";

export function SiteHeader({ onLaunch }: { onLaunch: () => void }) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const links = [
    { label: "Features", href: "#features" },
    { label: "Servers", href: "#servers-cta" },
    { label: "Download", href: "#download" },
    { label: "GitHub", href: "https://github.com/di6tort-bit/distort", ext: true },
  ];

  return (
    <header
      className={`sticky top-0 z-40 transition-all duration-300 ${
        scrolled ? "bg-[#050814]/85 backdrop-blur-xl border-b border-white/5" : "bg-transparent"
      }`}
    >
      <div className="mx-auto max-w-6xl px-4">
        <div className="flex items-center justify-between h-14">
          <a href="#" className="flex items-center">
            <DistortWordmark size={28} />
          </a>

          <nav className="hidden md:flex items-center gap-1">
            {links.map((l) => (
              <a
                key={l.label}
                href={l.href}
                target={l.ext ? "_blank" : undefined}
                rel={l.ext ? "noreferrer" : undefined}
                className="px-3 py-1.5 rounded-lg text-sm text-muted-foreground hover:text-white hover:bg-white/[0.04] transition-colors font-tech uppercase tracking-wider text-xs"
              >
                {l.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <a href="https://github.com/di6tort-bit/distort" target="_blank" rel="noreferrer" className="hidden sm:block">
              <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-white h-9 w-9">
                <Github className="w-4 h-4" />
              </Button>
            </a>
            <Button onClick={onLaunch} size="sm" className="bg-brand-gradient text-[#02131a] hover:opacity-90 font-tech uppercase tracking-wider px-4">
              <Power className="w-3.5 h-3.5 mr-1.5" /> Launch
            </Button>
            <Button variant="ghost" size="icon" className="md:hidden text-muted-foreground" onClick={() => setOpen((o) => !o)}>
              {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </Button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {open && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="md:hidden bg-[#070b16]/95 backdrop-blur-xl border-b border-white/5"
        >
          <nav className="px-4 py-3 space-y-1">
            {links.map((l) => (
              <a
                key={l.label}
                href={l.href}
                target={l.ext ? "_blank" : undefined}
                rel={l.ext ? "noreferrer" : undefined}
                onClick={() => setOpen(false)}
                className="block px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-white hover:bg-white/[0.04] font-tech uppercase tracking-wider"
              >
                {l.label}
              </a>
            ))}
          </nav>
        </motion.div>
      )}
    </header>
  );
}
