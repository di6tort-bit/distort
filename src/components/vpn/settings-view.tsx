"use client";

import { useEffect, useState } from "react";
import { Shield, ShieldCheck, ShieldOff, Lock, Eye, EyeOff, Power, Globe, Wifi, Network, Skull, Settings as Cog, Save, RotateCcw } from "lucide-react";
import { useVpnStore, type Settings } from "@/lib/vpn-store";
import { useFetch, putJSON } from "@/hooks/use-fetch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { PROTOCOLS } from "@/lib/vpn-data";

export function SettingsView() {
  const { settings, updateSettings } = useVpnStore();
  const { data: remote } = useFetch<Settings>("/api/settings");
  const [local, setLocal] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (remote && !local) setLocal(remote);
  }, [remote, local]);

  const active = local ?? settings;

  const set = (patch: Partial<Settings>) => {
    if (local) setLocal({ ...local, ...patch });
    updateSettings(patch);
  };

  const handleSave = async () => {
    if (!local) return;
    setSaving(true);
    try {
      await putJSON("/api/settings", local);
      toast.success("Settings saved", { description: "Your privacy & security preferences are synced." });
    } catch (e) {
      toast.error("Could not save settings", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    const defaults: Settings = {
      protocol: "wireguard", killSwitch: true, dnsLeakProtection: true, ipv6LeakProtection: true,
      splitTunneling: false, obfuscation: true, autoConnect: false, blockTrackers: true, blockAds: false,
      stealthMode: true, preferredRegion: "auto", mtu: 1420, dnsServers: "1.1.1.1,9.9.9.9",
    };
    setLocal(defaults);
    updateSettings(defaults);
    toast.info("Reset to defaults", { description: "Press Save to persist." });
  };

  return (
    <div className="space-y-4">
      {/* Protocol selection */}
      <Card className="glass border-white/5">
        <CardHeader className="pb-3">
          <CardTitle className="font-display tracking-wider text-sm flex items-center gap-2">
            <Network className="w-4 h-4 text-[#00f0ff]" /> Protocol & Transport
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {PROTOCOLS.map((p) => {
            const selected = active.protocol === p.id;
            return (
              <button
                key={p.id}
                onClick={() => set({ protocol: p.id })}
                className={`text-left rounded-xl p-3 border transition-all ${
                  selected ? "border-[#00f0ff]/50 bg-[#00f0ff]/[0.06] ring-glow" : "border-white/5 bg-white/[0.02] hover:border-[#00f0ff]/30"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-display font-bold text-sm text-white">{p.name}</span>
                  <span className="text-[9px] font-tech uppercase tracking-wider px-1.5 py-0.5 rounded border border-[#8b5cf6]/40 text-[#8b5cf6]">{p.badge}</span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">{p.description}</p>
                <div className="mt-2 flex items-center gap-3 text-[10px]">
                  <Meter label="Speed" value={p.speed} color="#10d9a0" />
                  <Meter label="Resist" value={p.resilience} color="#00f0ff" />
                </div>
              </button>
            );
          })}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Security */}
        <Card className="glass border-white/5">
          <CardHeader className="pb-3">
            <CardTitle className="font-display tracking-wider text-sm flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#10d9a0]" /> Security
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <Toggle icon={<Skull className="w-4 h-4 text-[#ff4d6d]" />} label="Kill Switch" desc="Block all traffic if the tunnel drops. Prevents real-IP leaks." value={active.killSwitch} onChange={(v) => set({ killSwitch: v })} />
            <Toggle icon={<Lock className="w-4 h-4 text-[#00f0ff]" />} label="DNS Leak Protection" desc="Force DNS through the encrypted tunnel, never your ISP." value={active.dnsLeakProtection} onChange={(v) => set({ dnsLeakProtection: v })} />
            <Toggle icon={<ShieldOff className="w-4 h-4 text-[#8b5cf6]" />} label="IPv6 Leak Protection" desc="Disable IPv6 to avoid accidental exposure on dual-stack." value={active.ipv6LeakProtection} onChange={(v) => set({ ipv6LeakProtection: v })} />
            <Toggle icon={<EyeOff className="w-4 h-4 text-[#ffb020]" />} label="Obfuscation" desc="Randomize packet sizes & timing to defeat DPI fingerprinting." value={active.obfuscation} onChange={(v) => set({ obfuscation: v })} />
          </CardContent>
        </Card>

        {/* Anti-censorship */}
        <Card className="glass border-white/5">
          <CardHeader className="pb-3">
            <CardTitle className="font-display tracking-wider text-sm flex items-center gap-2">
              <Shield className="w-4 h-4 text-[#8b5cf6]" /> Anti-Censorship (Iran-resilience)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <Toggle icon={<Eye className="w-4 h-4 text-[#00f0ff]" />} label="Stealth Mode" desc="Prefer obfuscated nodes (Trojan/V2Ray-WS-TLS). Recommended for hostile networks." value={active.stealthMode} onChange={(v) => set({ stealthMode: v })} />
            <Toggle icon={<Power className="w-4 h-4 text-[#10d9a0]" />} label="Auto-Connect on startup" desc="Reconnect automatically to the last server." value={active.autoConnect} onChange={(v) => set({ autoConnect: v })} />
            <Toggle icon={<Shield className="w-4 h-4 text-[#5cf2ff]" />} label="Block Trackers" desc="Drop connections to known tracker domains." value={active.blockTrackers} onChange={(v) => set({ blockTrackers: v })} />
            <Toggle icon={<ShieldOff className="w-4 h-4 text-[#ff4d6d]" />} label="Block Ads" desc="Block ad networks at the DNS layer." value={active.blockAds} onChange={(v) => set({ blockAds: v })} />
            <Toggle icon={<Network className="w-4 h-4 text-[#8b5cf6]" />} label="Split Tunneling" desc="Route only selected apps through the tunnel (beta)." value={active.splitTunneling} onChange={(v) => set({ splitTunneling: v })} />
          </CardContent>
        </Card>
      </div>

      {/* Network */}
      <Card className="glass border-white/5">
        <CardHeader className="pb-3">
          <CardTitle className="font-display tracking-wider text-sm flex items-center gap-2">
            <Globe className="w-4 h-4 text-[#00f0ff]" /> Network
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-tech uppercase tracking-wider text-muted-foreground">Preferred Region</Label>
            <Input value={active.preferredRegion} onChange={(e) => set({ preferredRegion: e.target.value })} className="bg-white/[0.03] border-white/10" placeholder="auto" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-tech uppercase tracking-wider text-muted-foreground">MTU</Label>
            <Input type="number" value={active.mtu} onChange={(e) => set({ mtu: Number(e.target.value) })} className="bg-white/[0.03] border-white/10" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-tech uppercase tracking-wider text-muted-foreground">Custom DNS</Label>
            <Input value={active.dnsServers} onChange={(e) => set({ dnsServers: e.target.value })} className="bg-white/[0.03] border-white/10" />
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground font-tech uppercase tracking-wider flex items-center gap-1">
          <Cog className="w-3 h-3" /> {local ? "Unsaved changes" : "In sync"}
        </p>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={handleReset} className="text-muted-foreground hover:text-white">
            <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Reset
          </Button>
          <Button onClick={handleSave} disabled={saving || !local} className="bg-brand-gradient text-[#02131a] hover:opacity-90 font-tech uppercase tracking-wider">
            <Save className="w-3.5 h-3.5 mr-1.5" /> {saving ? "Saving…" : "Save Settings"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Toggle({
  icon, label, desc, value, onChange,
}: { icon: React.ReactNode; label: string; desc: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-white/5 last:border-0">
      <div className="mt-0.5">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-white">{label}</div>
        <div className="text-xs text-muted-foreground leading-relaxed">{desc}</div>
      </div>
      <Switch checked={value} onCheckedChange={onChange} />
    </div>
  );
}

function Meter({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-muted-foreground uppercase tracking-wider">{label}</span>
      <div className="w-12 h-1 rounded-full bg-white/10 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${value}%`, background: color }} />
      </div>
      <span className="text-muted-foreground">{value}</span>
    </div>
  );
}
