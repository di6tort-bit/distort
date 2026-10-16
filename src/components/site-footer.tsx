"use client";

import { DistortLogo } from "@/components/vpn/distort-logo";
import { Github, Heart, Shield, Globe2, Lock } from "lucide-react";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-white/5 bg-[#050814]/80 backdrop-blur-xl">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
          {/* Brand */}
          <div className="col-span-2">
            <div className="flex items-center gap-3 mb-3">
              <DistortLogo size={36} />
              <div>
                <div className="font-display text-lg font-extrabold tracking-[0.18em] text-white">
                  DIST<span className="text-gradient-cyan">O</span>RT
                </div>
                <div className="text-[10px] font-tech uppercase tracking-[0.3em] text-muted-foreground mt-0.5">
                  Freedom Beyond Borders
                </div>
              </div>
            </div>
            <p className="text-sm text-muted-foreground max-w-sm leading-relaxed">
              A 100% free, anti-censorship VPN built to stay online when the internet goes dark.
              Open source. No logs. No paywalls.
            </p>
            <div className="flex items-center gap-2 mt-4">
              <a href="https://github.com/di6tort-bit/distort" target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-[#5cf2ff] transition-colors">
                <Github className="w-5 h-5" />
              </a>
              <span className="text-xs text-muted-foreground font-tech uppercase tracking-wider ml-2">v1.0.0 · MIT</span>
            </div>
          </div>

          {/* Product */}
          <div>
            <h4 className="font-display text-xs font-bold uppercase tracking-[0.2em] text-white mb-3">Product</h4>
            <ul className="space-y-2 text-sm">
              <li><a href="#features" className="text-muted-foreground hover:text-[#5cf2ff] transition-colors">Features</a></li>
              <li><a href="#download" className="text-muted-foreground hover:text-[#5cf2ff] transition-colors">Download</a></li>
              <li><a href="https://github.com/di6tort-bit/distort" target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-[#5cf2ff] transition-colors">Chrome Extension</a></li>
              <li><a href="#" className="text-muted-foreground hover:text-[#5cf2ff] transition-colors">Servers</a></li>
              <li><a href="#" className="text-muted-foreground hover:text-[#5cf2ff] transition-colors">Status</a></li>
            </ul>
          </div>

          {/* Resources */}
          <div>
            <h4 className="font-display text-xs font-bold uppercase tracking-[0.2em] text-white mb-3">Resources</h4>
            <ul className="space-y-2 text-sm">
              <li><a href="https://github.com/di6tort-bit/distort" target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-[#5cf2ff] transition-colors">Documentation</a></li>
              <li><a href="https://github.com/di6tort-bit/distort" target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-[#5cf2ff] transition-colors">Security audit</a></li>
              <li><a href="https://github.com/di6tort-bit/distort" target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-[#5cf2ff] transition-colors">Privacy policy</a></li>
              <li><a href="https://github.com/di6tort-bit/distort" target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-[#5cf2ff] transition-colors">Roadmap</a></li>
              <li><a href="https://github.com/di6tort-bit/distort" target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-[#5cf2ff] transition-colors">Run a relay</a></li>
            </ul>
          </div>
        </div>

        {/* Trust bar */}
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 py-4 border-t border-white/5 text-[11px] text-muted-foreground font-tech uppercase tracking-wider">
          <span className="flex items-center gap-1.5"><Shield className="w-3.5 h-3.5 text-[#10d9a0]" /> AES-256 / ChaCha20</span>
          <span className="flex items-center gap-1.5"><Lock className="w-3.5 h-3.5 text-[#8b5cf6]" /> No-log architecture</span>
          <span className="flex items-center gap-1.5"><Globe2 className="w-3.5 h-3.5 text-[#00f0ff]" /> 30+ countries · stealth mesh</span>
          <span className="flex items-center gap-1.5"><Heart className="w-3.5 h-3.5 text-[#ff4d6d]" /> 100% free · community-funded</span>
        </div>

        {/* Bottom */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-4 text-[11px] text-muted-foreground">
          <span>© {new Date().getFullYear()} Distort Project. MIT Licensed.</span>
          <span className="font-tech uppercase tracking-wider">
            Built for the moments that matter most.
          </span>
        </div>
      </div>
    </footer>
  );
}
