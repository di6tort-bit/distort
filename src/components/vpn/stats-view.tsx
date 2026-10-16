"use client";

import { useFetch } from "@/hooks/use-fetch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, Download, Upload, Clock, Server, TrendingUp, Globe2 } from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell, Legend,
} from "recharts";

type Stats = {
  totals: { sessions: number; bytesDown: number; bytesUp: number; durationSec: number; serversOnline: number; serversTotal: number };
  byProtocol: { protocol: string; sessions: number; bytesDown: number; bytesUp: number; durationSec: number }[];
  daily: { date: string; bytesDown: number; bytesUp: number; sessions: number }[];
};

function fmtBytes(b: number) {
  if (!b) return "0 B";
  if (b < 1e6) return `${(b / 1e3).toFixed(1)} KB`;
  if (b < 1e9) return `${(b / 1e6).toFixed(1)} MB`;
  if (b < 1e12) return `${(b / 1e9).toFixed(2)} GB`;
  return `${(b / 1e12).toFixed(2)} TB`;
}

function fmtDur(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

const PIE_COLORS = ["#00f0ff", "#2962ff", "#8b5cf6", "#10d9a0", "#ffb020"];

export function StatsView() {
  const { data, loading } = useFetch<Stats>("/api/stats");

  if (loading || !data) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="glass border-white/5 h-44 animate-pulse" />
        ))}
      </div>
    );
  }

  const { totals, byProtocol, daily } = data;
  const chartDaily = daily.map((d) => ({
    day: d.date.slice(5), // MM-DD
    down: d.bytesDown,
    up: d.bytesUp,
  }));
  const chartByProtocol = byProtocol.map((p) => ({ protocol: p.protocol, count: p.sessions }));

  return (
    <div className="space-y-4">
      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi icon={<Download className="w-4 h-4" />} label="Total Download" value={fmtBytes(totals.bytesDown)} color="#10d9a0" />
        <Kpi icon={<Upload className="w-4 h-4" />} label="Total Upload" value={fmtBytes(totals.bytesUp)} color="#00f0ff" />
        <Kpi icon={<Clock className="w-4 h-4" />} label="Time Online" value={fmtDur(totals.durationSec)} color="#8b5cf6" />
        <Kpi icon={<Server className="w-4 h-4" />} label="Nodes Online" value={`${totals.serversOnline} / ${totals.serversTotal}`} color="#ffb020" />
      </div>

      {/* Daily usage area chart */}
      <Card className="glass border-white/5">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="font-display tracking-wider text-sm flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-[#00f0ff]" /> 7-Day Traffic
            </CardTitle>
            <Badge variant="outline" className="border-[#00f0ff]/30 text-[#5cf2ff] font-tech uppercase text-[10px]">
              <Activity className="w-3 h-3 mr-1" />Live
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartDaily} margin={{ top: 10, right: 8, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="downGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10d9a0" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#10d9a0" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="upGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#00f0ff" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#00f0ff" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="day" tick={{ fill: "#8aa0c4", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={(v) => fmtBytes(v)} tick={{ fill: "#8aa0c4", fontSize: 11 }} axisLine={false} tickLine={false} width={50} />
              <Tooltip
                contentStyle={{ background: "#0d1426", border: "1px solid rgba(0,240,255,0.3)", borderRadius: 12, fontSize: 12 }}
                labelStyle={{ color: "#5cf2ff" }}
                formatter={(v: number) => fmtBytes(v)}
              />
              <Area type="monotone" dataKey="down" stroke="#10d9a0" strokeWidth={2} fill="url(#downGrad)" name="Download" />
              <Area type="monotone" dataKey="up" stroke="#00f0ff" strokeWidth={2} fill="url(#upGrad)" name="Upload" />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Protocol distribution */}
        <Card className="glass border-white/5">
          <CardHeader className="pb-2">
            <CardTitle className="font-display tracking-wider text-sm flex items-center gap-2">
              <Globe2 className="w-4 h-4 text-[#8b5cf6]" /> Protocol Usage
            </CardTitle>
          </CardHeader>
          <CardContent className="h-56">
            {chartByProtocol.length === 0 ? (
              <EmptyHint label="No sessions yet — connect to start gathering telemetry." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={chartByProtocol} dataKey="count" nameKey="protocol" innerRadius={45} outerRadius={75} paddingAngle={3}>
                    {chartByProtocol.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} stroke="#0a0f1f" strokeWidth={2} />
                    ))}
                  </Pie>
                  <Legend wrapperStyle={{ fontSize: 11, color: "#8aa0c4" }} />
                  <Tooltip contentStyle={{ background: "#0d1426", border: "1px solid rgba(0,240,255,0.3)", borderRadius: 12, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Per-protocol bar */}
        <Card className="glass border-white/5">
          <CardHeader className="pb-2">
            <CardTitle className="font-display tracking-wider text-sm flex items-center gap-2">
              <Activity className="w-4 h-4 text-[#00f0ff]" /> Sessions by Protocol
            </CardTitle>
          </CardHeader>
          <CardContent className="h-56">
            {chartByProtocol.length === 0 ? (
              <EmptyHint label="Sessions will appear here after your first connection." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartByProtocol} margin={{ top: 10, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="protocol" tick={{ fill: "#8aa0c4", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#8aa0c4", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: "#0d1426", border: "1px solid rgba(0,240,255,0.3)", borderRadius: 12, fontSize: 12 }} />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                    {chartByProtocol.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Kpi({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <Card className="glass border-white/5 relative overflow-hidden">
      <div className="absolute inset-0 opacity-30" style={{ background: `radial-gradient(circle at top right, ${color}, transparent 70%)` }} />
      <CardContent className="p-4 relative">
        <div className="flex items-center gap-2 mb-2">
          <span style={{ color }}>{icon}</span>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-tech">{label}</span>
        </div>
        <div className="font-display text-xl font-bold text-white">{value}</div>
      </CardContent>
    </Card>
  );
}

function EmptyHint({ label }: { label: string }) {
  return (
    <div className="h-full flex items-center justify-center text-center px-6">
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}
