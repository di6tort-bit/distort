"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Gauge, Zap, Download, Upload, Activity, Server as ServerIcon, RefreshCw, Award } from "lucide-react";
import { useFetch, postJSON } from "@/hooks/use-fetch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useVpnStore, type ServerLite } from "@/lib/vpn-store";

type Result = {
  downloadMbps: number;
  uploadMbps: number;
  pingMs: number;
  jitterMs: number;
  serverId: string;
};

export function SpeedTestView() {
  const { data } = useFetch<{ servers: ServerLite[] }>("/api/servers");
  const { currentServer } = useVpnStore();
  const [result, setResult] = useState<Result | null>(null);
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState<"idle" | "ping" | "down" | "up">("idle");
  const [progress, setProgress] = useState(0);

  const target = currentServer ?? data?.servers?.[0];

  const run = async () => {
    if (!target) {
      toast.error("Pick a server first", { description: "Select a server in the Servers tab." });
      return;
    }
    setRunning(true);
    setResult(null);
    setProgress(0);

    // Animated phase progression for the visual gauge
    const phases: Array<[typeof phase, number]> = [
      ["ping", 25],
      ["down", 70],
      ["up", 100],
    ];
    for (const [p, pct] of phases) {
      setPhase(p);
      const start = pct === 25 ? 0 : phases[phases.findIndex((x) => x[0] === p) - 1][1];
      const steps = 12;
      for (let i = 1; i <= steps; i++) {
        await new Promise((r) => setTimeout(r, 60));
        setProgress(start + ((pct - start) * i) / steps);
      }
    }

    try {
      const r = await postJSON<Result>("/api/speedtest", { serverId: target.id });
      setResult(r);
      setPhase("idle");
      setProgress(100);
      toast.success("Speed test complete", {
        description: `${r.downloadMbps.toFixed(1)} Mbps down · ${r.uploadMbps.toFixed(1)} Mbps up`,
      });
    } catch (e) {
      toast.error("Speed test failed", { description: (e as Error).message });
      setPhase("idle");
    } finally {
      setRunning(false);
    }
  };

  const downVal = running && phase === "down" ? progress * 1.2 : result?.downloadMbps ?? 0;
  const upVal = running && phase === "up" ? progress * 0.6 : result?.uploadMbps ?? 0;
  const pingVal = running && phase === "ping" ? 30 - progress * 0.1 : result?.pingMs ?? 0;

  return (
    <div className="space-y-4">
      <Card className="glass border-white/5 relative overflow-hidden">
        <div className="mesh-bg opacity-50" />
        <CardContent className="relative z-10 p-6 flex flex-col items-center">
          <div className="flex items-center gap-2 mb-1">
            <Gauge className="w-4 h-4 text-[#00f0ff]" />
            <span className="font-display tracking-[0.2em] text-xs uppercase text-muted-foreground">Distort Speed Test</span>
          </div>
          <p className="text-xs text-muted-foreground mb-6 text-center max-w-md">
            Measure real throughput to the {target ? `${target.flag} ${target.country}` : "selected"} node. Tests run over your active protocol.
          </p>

          {/* Gauge */}
          <div className="relative w-56 h-56 mb-6">
            <svg viewBox="0 0 200 200" className="w-full h-full -rotate-90">
              <circle cx="100" cy="100" r="86" stroke="rgba(255,255,255,0.05)" strokeWidth="10" fill="none" />
              <motion.circle
                cx="100" cy="100" r="86"
                stroke="url(#gaugeGrad)" strokeWidth="10" fill="none" strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 86}
                animate={{ strokeDashoffset: 2 * Math.PI * 86 * (1 - Math.min(downVal, 100) / 100) }}
                transition={{ duration: 0.2 }}
              />
              <defs>
                <linearGradient id="gaugeGrad" x1="0" y1="0" x2="1" y2="1">
                  <stop stopColor="#5cf2ff" />
                  <stop offset="0.5" stopColor="#00f0ff" />
                  <stop offset="1" stopColor="#8b5cf6" />
                </linearGradient>
              </defs>
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-display text-5xl font-extrabold text-white tabular-nums">
                {downVal.toFixed(1)}
              </span>
              <span className="text-xs font-tech uppercase tracking-[0.2em] text-muted-foreground">Mbps down</span>
            </div>
          </div>

          <Button
            onClick={run}
            disabled={running}
            className="bg-brand-gradient text-[#02131a] hover:opacity-90 font-tech uppercase tracking-[0.2em] px-8 h-12"
          >
            {running ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Testing…
              </>
            ) : (
              <>
                <Zap className="w-4 h-4 mr-2" /> {result ? "Run Again" : "Start Test"}
              </>
            )}
          </Button>

          <div className="mt-2 text-[11px] font-tech uppercase tracking-wider text-muted-foreground">
            {phase === "ping" && "Measuring latency…"}
            {phase === "down" && "Downloading test payload…"}
            {phase === "up" && "Uploading test payload…"}
            {phase === "idle" && result && "Done."}
            {phase === "idle" && !result && "Ready."}
          </div>
        </CardContent>
      </Card>

      {/* Result grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat icon={<Download className="w-4 h-4" />} label="Download" value={result ? `${result.downloadMbps.toFixed(1)}` : "—"} unit="Mbps" color="#10d9a0" />
        <Stat icon={<Upload className="w-4 h-4" />} label="Upload" value={result ? `${result.uploadMbps.toFixed(1)}` : "—"} unit="Mbps" color="#00f0ff" />
        <Stat icon={<Activity className="w-4 h-4" />} label="Ping" value={result ? `${result.pingMs}` : "—"} unit="ms" color="#ffb020" />
        <Stat icon={<Award className="w-4 h-4" />} label="Jitter" value={result ? `${result.jitterMs}` : "—"} unit="ms" color="#8b5cf6" />
      </div>

      {target && (
        <Card className="glass border-white/5">
          <CardHeader className="pb-2">
            <CardTitle className="font-display tracking-wider text-xs uppercase flex items-center gap-2 text-muted-foreground">
              <ServerIcon className="w-3.5 h-3.5" /> Target Node
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-3">
            <span className="text-2xl">{target.flag}</span>
            <div className="flex-1">
              <div className="font-semibold text-white">{target.country} · {target.city}</div>
              <div className="text-xs text-muted-foreground font-tech uppercase tracking-wider">{target.code} · {target.host}</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-muted-foreground font-tech uppercase tracking-wider">Rated</div>
              <div className="font-mono text-sm text-[#10d9a0]">{target.downMbps} / {target.upMbps} Mbps</div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Stat({ icon, label, value, unit, color }: { icon: React.ReactNode; label: string; value: string; unit: string; color: string }) {
  return (
    <Card className="glass border-white/5 relative overflow-hidden">
      <div className="absolute inset-0 opacity-25" style={{ background: `radial-gradient(circle at top right, ${color}, transparent 70%)` }} />
      <CardContent className="p-4 relative">
        <div className="flex items-center gap-2 mb-1.5">
          <span style={{ color }}>{icon}</span>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-tech">{label}</span>
        </div>
        <div className="font-display text-2xl font-bold text-white tabular-nums">
          {value} <span className="text-xs text-muted-foreground font-tech">{unit}</span>
        </div>
      </CardContent>
    </Card>
  );
}
