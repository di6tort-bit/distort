"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Power, Shield, ShieldCheck, Zap, Activity, Globe2, Radio, Lock } from "lucide-react";
import { useVpnStore, formatRate, formatBytes, formatDuration, type ServerLite } from "@/lib/vpn-store";
import { postJSON } from "@/hooks/use-fetch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

function pingColor(p: number) {
  if (p === 0) return "#8aa0c4";
  if (p < 60) return "#10d9a0";
  if (p < 120) return "#ffb020";
  return "#ff4d6d";
}

export function ConnectView({ onPickServer }: { onPickServer: () => void }) {
  const { state, currentServer, live, settings, connect, disconnect } = useVpnStore();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (state !== "connected") return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [state]);

  const elapsed = live.connectedSince ? Math.floor((now - live.connectedSince) / 1000) : 0;

  const isConnected = state === "connected";
  const isConnecting = state === "connecting";

  const handleToggle = async () => {
    if (state === "disconnected" || state === "error") {
      if (!currentServer) {
        onPickServer();
        return;
      }
      connect(currentServer as ServerLite, settings.protocol);
      try {
        await postJSON("/api/connect", {
          serverId: (currentServer as ServerLite).id,
          protocol: settings.protocol,
          action: "connect",
        });
      } catch {
        /* UI still simulates locally */
      }
    } else if (state === "connected") {
      disconnect();
      try {
        await postJSON("/api/connect", { action: "disconnect" });
      } catch {
        /* ignore */
      }
    }
  };

  const climateLevel = isConnected ? "safe" : isConnecting ? "degraded" : "hostile";
  const climateLabel =
    climateLevel === "safe"
      ? "Open internet · secure tunnel active"
      : climateLevel === "degraded"
      ? "Establishing encrypted tunnel…"
      : "National filtering detected · stealth recommended";

  return (
    <div className="relative flex flex-col items-center justify-center py-8 px-4">
      <div className="mesh-bg" />
      <div className="relative z-10 w-full max-w-md mx-auto flex flex-col items-center">
        {/* Climate line */}
        <div className="mb-6 flex items-center gap-2 text-xs font-tech uppercase tracking-[0.2em] text-muted-foreground">
          <span
            className={`dot-live inline-block w-2 h-2 rounded-full ${
              climateLevel === "safe" ? "bg-[#10d9a0] text-[#10d9a0]" : climateLevel === "degraded" ? "bg-[#ffb020] text-[#ffb020]" : "bg-[#ff4d6d] text-[#ff4d6d]"
            }`}
          />
          <span>{climateLabel}</span>
        </div>

        {/* Power button */}
        <div className="relative flex items-center justify-center w-[280px] h-[280px] my-4">
          {/* Outer rings */}
          <div className="absolute inset-0 rounded-full border border-white/5" />
          <div className="absolute inset-6 rounded-full border border-white/5" />
          <div className="absolute inset-12 rounded-full border border-white/10" />

          <AnimatePresence>
            {isConnected && (
              <>
                <span className="pulse-ring" />
                <span className="pulse-ring" />
                <span className="pulse-ring" />
              </>
            )}
          </AnimatePresence>

          {isConnecting && (
            <div className="absolute inset-4 rounded-full conic-spinner opacity-70" style={{ mask: "radial-gradient(transparent 58%, black 60%)", WebkitMask: "radial-gradient(transparent 58%, black 60%)" }} />
          )}

          <motion.button
            onClick={handleToggle}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            className={`relative z-10 w-44 h-44 rounded-full flex flex-col items-center justify-center gap-2 transition-all duration-300 ${
              isConnected
                ? "bg-brand-gradient ring-glow"
                : isConnecting
                ? "bg-card border border-[#00f0ff]/40"
                : "bg-card border border-white/10 hover:border-[#00f0ff]/50"
            }`}
            aria-label={isConnected ? "Disconnect VPN" : "Connect VPN"}
          >
            <Power
              className={`w-12 h-12 ${isConnected ? "text-[#02131a]" : "text-[#00f0ff]"}`}
              strokeWidth={2.2}
            />
            <span className={`font-tech uppercase tracking-[0.3em] text-xs ${isConnected ? "text-[#02131a]" : "text-muted-foreground"}`}>
              {isConnected ? "Connected" : isConnecting ? "Connecting" : "Tap to Connect"}
            </span>
          </motion.button>
        </div>

        {/* Status card */}
        <div className="w-full glass-strong rounded-2xl p-5 mt-4 scanline">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Globe2 className="w-4 h-4 text-[#00f0ff]" />
              <span className="font-tech uppercase tracking-[0.2em] text-xs text-muted-foreground">Current Server</span>
            </div>
            <Badge variant="outline" className="border-[#00f0ff]/30 text-[#5cf2ff] font-tech uppercase tracking-wider text-[10px]">
              {settings.protocol}
            </Badge>
          </div>

          {currentServer ? (
            <button onClick={onPickServer} className="w-full text-left group">
              <div className="flex items-center gap-3">
                <span className="text-3xl">{currentServer.flag}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-display text-lg font-bold text-white truncate">
                    {currentServer.country}
                  </div>
                  <div className="text-xs text-muted-foreground font-tech uppercase tracking-wider truncate">
                    {currentServer.city} · {currentServer.code}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-sm font-semibold" style={{ color: pingColor(currentServer.ping) }}>
                    {currentServer.ping}ms
                  </div>
                  {currentServer.stealth && (
                    <div className="flex items-center gap-1 justify-end mt-0.5">
                      <Shield className="w-3 h-3 text-[#8b5cf6]" />
                      <span className="text-[10px] text-[#8b5cf6] font-tech uppercase tracking-wider">Stealth</span>
                    </div>
                  )}
                </div>
              </div>
            </button>
          ) : (
            <button onClick={onPickServer} className="w-full py-3 text-center text-sm text-muted-foreground hover:text-[#00f0ff] transition-colors">
              Select a server →
            </button>
          )}

          {/* Live metrics */}
          {isConnected && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-white/5"
            >
              <Metric icon={<Activity className="w-3 h-3" />} label="Down" value={formatRate(live.downBps)} color="#10d9a0" />
              <Metric icon={<Radio className="w-3 h-3" />} label="Up" value={formatRate(live.upBps)} color="#00f0ff" />
              <Metric icon={<Zap className="w-3 h-3" />} label="Ping" value={`${live.ping}ms`} color="#ffb020" />
              <Metric icon={<Activity className="w-3 h-3" />} label="Session" value={formatDuration(elapsed)} color="#8b5cf6" />
              <Metric icon={<Lock className="w-3 h-3" />} label="Downloaded" value={formatBytes(live.totalDown)} color="#eaf2ff" />
              <Metric icon={<Lock className="w-3 h-3" />} label="Uploaded" value={formatBytes(live.totalUp)} color="#eaf2ff" />
            </motion.div>
          )}
        </div>

        {/* Quick toggles */}
        <div className="w-full grid grid-cols-3 gap-2 mt-3">
          <QuickToggle label="Kill Switch" on={settings.killSwitch} icon={<ShieldCheck className="w-3.5 h-3.5" />} />
          <QuickToggle label="Stealth" on={settings.stealthMode} icon={<Shield className="w-3.5 h-3.5" />} />
          <QuickToggle label="No Trackers" on={settings.blockTrackers} icon={<Lock className="w-3.5 h-3.5" />} />
        </div>
      </div>
    </div>
  );
}

function Metric({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div className="rounded-lg bg-white/[0.03] border border-white/5 px-2.5 py-2">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground font-tech" style={{ color }}>
        {icon}
        {label}
      </div>
      <div className="font-mono text-sm font-semibold mt-0.5 text-white truncate">{value}</div>
    </div>
  );
}

function QuickToggle({ label, on, icon }: { label: string; on: boolean; icon: React.ReactNode }) {
  return (
    <div
      className={`rounded-lg border px-3 py-2 flex items-center gap-2 transition-colors ${
        on ? "border-[#00f0ff]/30 bg-[#00f0ff]/[0.06] text-[#5cf2ff]" : "border-white/5 bg-white/[0.02] text-muted-foreground"
      }`}
    >
      {icon}
      <span className="text-[11px] font-tech uppercase tracking-wider truncate">{label}</span>
    </div>
  );
}
