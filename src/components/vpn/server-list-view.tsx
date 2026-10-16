"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Search, Shield, Crown, Zap, X, Check, Wifi } from "lucide-react";
import { useVpnStore, type ServerLite } from "@/lib/vpn-store";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useFetch } from "@/hooks/use-fetch";

type ApiServer = ServerLite;

function pingColor(p: number) {
  if (p === 0) return "#8aa0c4";
  if (p < 60) return "#10d9a0";
  if (p < 120) return "#ffb020";
  return "#ff4d6d";
}

export function ServerListView({ onConnected }: { onConnected: () => void }) {
  const { data, loading } = useFetch<{ servers: ApiServer[] }>("/api/servers");
  const { currentServer, setCurrentServer, connect, settings } = useVpnStore();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "stealth" | "premium">("all");

  const servers = useMemo(() => {
    const list = data?.servers ?? [];
    return list.filter((s) => {
      if (filter === "stealth" && !s.stealth) return false;
      if (filter === "premium" && !s.premium) return false;
      if (!query) return true;
      const q = query.toLowerCase();
      return (
        s.country.toLowerCase().includes(q) ||
        s.city.toLowerCase().includes(q) ||
        s.code.toLowerCase().includes(q)
      );
    });
  }, [data, query, filter]);

  const handleSelect = (s: ApiServer) => {
    setCurrentServer(s);
    connect(s, settings.protocol);
    onConnected();
  };

  return (
    <div className="flex flex-col h-full">
      {/* Search + filters */}
      <div className="flex flex-col gap-3 mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search 30+ countries, cities, or node codes…"
            className="pl-10 bg-white/[0.03] border-white/10 focus-visible:border-[#00f0ff]/50 focus-visible:ring-[#00f0ff]/20"
          />
          {query && (
            <button onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {(["all", "stealth", "premium"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-tech uppercase tracking-wider transition-colors border ${
                filter === f
                  ? "bg-[#00f0ff]/10 border-[#00f0ff]/40 text-[#5cf2ff]"
                  : "bg-white/[0.02] border-white/5 text-muted-foreground hover:text-white"
              }`}
            >
              {f === "all" ? "All Nodes" : f === "stealth" ? "Stealth" : "Premium"}
            </button>
          ))}
          <span className="ml-auto text-xs text-muted-foreground font-tech">
            {servers.length} / {data?.servers.length ?? 0} nodes
          </span>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 max-h-[560px] overflow-y-auto pr-1 -mr-1 space-y-2">
        {loading
          ? Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
          : servers.map((s, i) => {
              const active = currentServer?.id === s.id;
              return (
                <motion.button
                  key={s.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.015, 0.3) }}
                  onClick={() => s.online && handleSelect(s)}
                  disabled={!s.online}
                  className={`w-full text-left rounded-xl p-3 border transition-all ${
                    active
                      ? "border-[#00f0ff]/50 bg-[#00f0ff]/[0.06] ring-glow"
                      : s.online
                      ? "border-white/5 bg-white/[0.02] hover:border-[#00f0ff]/30 hover:bg-white/[0.04]"
                      : "border-white/5 bg-white/[0.01] opacity-50 cursor-not-allowed"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{s.flag}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-white truncate">{s.country}</span>
                        {s.stealth && (
                          <Badge variant="outline" className="border-[#8b5cf6]/40 text-[#8b5cf6] text-[9px] px-1.5 py-0 h-4 font-tech uppercase tracking-wider">
                            <Shield className="w-2.5 h-2.5 mr-0.5" />Stealth
                          </Badge>
                        )}
                        {s.premium && (
                          <Badge variant="outline" className="border-[#ffb020]/40 text-[#ffb020] text-[9px] px-1.5 py-0 h-4 font-tech uppercase tracking-wider">
                            <Crown className="w-2.5 h-2.5 mr-0.5" />Beta
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground font-tech uppercase tracking-wider truncate">
                        {s.city} · {s.code}
                      </div>
                      {s.note && <div className="text-[11px] text-muted-foreground/80 truncate mt-0.5">{s.note}</div>}
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <div className="flex items-center gap-1 font-mono text-sm font-semibold" style={{ color: pingColor(s.ping) }}>
                        <Zap className="w-3 h-3" />
                        {s.online ? `${s.ping}ms` : "—"}
                      </div>
                      <div className="w-16 h-1 rounded-full bg-white/5 overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${s.online ? s.load : 0}%`,
                            background: s.load > 70 ? "#ff4d6d" : s.load > 40 ? "#ffb020" : "#10d9a0",
                          }}
                        />
                      </div>
                      <div className="text-[9px] text-muted-foreground font-tech">{s.load}% load</div>
                    </div>
                    {active && (
                      <div className="ml-1 w-7 h-7 rounded-full bg-[#00f0ff]/15 flex items-center justify-center">
                        <Check className="w-4 h-4 text-[#5cf2ff]" />
                      </div>
                    )}
                  </div>
                </motion.button>
              );
            })}
      </div>

      <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground font-tech uppercase tracking-wider">
        <span className="flex items-center gap-1">
          <Wifi className="w-3 h-3 text-[#10d9a0]" />
          {(data?.servers ?? []).filter((s) => s.online).length} online
        </span>
        <Button variant="ghost" size="sm" className="text-xs h-7 text-muted-foreground hover:text-[#5cf2ff]" onClick={onConnected}>
          Back to dashboard →
        </Button>
      </div>
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="rounded-xl p-3 border border-white/5 bg-white/[0.02] animate-pulse">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-white/5" />
        <div className="flex-1 space-y-2">
          <div className="h-3 w-32 bg-white/5 rounded" />
          <div className="h-2 w-48 bg-white/5 rounded" />
        </div>
        <div className="h-3 w-10 bg-white/5 rounded" />
      </div>
    </div>
  );
}
