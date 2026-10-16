// DISTORT Mobile — React Native (Expo) App
// Android + iOS VPN client. Connects to the Distort control plane.
// Phase 2: integrates the native VPN service (VpnService on Android, Network Extension on iOS).

import React, { useEffect, useState } from "react";
import { StatusBar } from "expo-status-bar";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  useColorScheme,
  SafeAreaView,
  Platform,
  Alert,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as SecureStore from "expo-secure-store";
import { Power, Globe, Zap, Shield, Activity, Settings as Cog, User, Server } from "lucide-react-native";

// ---------------------------------------------------------------------------
// Brand palette (matches the web app)
// ---------------------------------------------------------------------------
const COLORS = {
  void: "#050814",
  surface: "#0d1426",
  surface2: "#111a31",
  cyan: "#00f0ff",
  cyanSoft: "#5cf2ff",
  blue: "#2962ff",
  violet: "#8b5cf6",
  emerald: "#10d9a0",
  amber: "#ffb020",
  rose: "#ff4d6d",
  white: "#eaf2ff",
  muted: "#8aa0c4",
};

// ---------------------------------------------------------------------------
// State (lightweight Zustand-like)
// ---------------------------------------------------------------------------
type ConnectionState = "disconnected" | "connecting" | "connected";

type Server = {
  id: string;
  code: string;
  country: string;
  city: string;
  flag: string;
  ping: number;
  stealth: boolean;
  premium: boolean;
};

type AppState = {
  connectionState: ConnectionState;
  currentServer: Server | null;
  liveStats: { downBps: number; upBps: number; sessionSec: number; ping: number };
  view: "connect" | "servers" | "speedtest" | "stats" | "settings" | "account";
};

const DEFAULT_STATE: AppState = {
  connectionState: "disconnected",
  currentServer: null,
  liveStats: { downBps: 0, upBps: 0, sessionSec: 0, ping: 0 },
  view: "connect",
};

// ---------------------------------------------------------------------------
// Main App
// ---------------------------------------------------------------------------
export default function App() {
  const [state, setState] = useState<AppState>(DEFAULT_STATE);
  const colorScheme = useColorScheme();

  // Load persisted state
  useEffect(() => {
    (async () => {
      try {
        const saved = await SecureStore.getItemAsync("distort_state");
        if (saved) {
          const parsed = JSON.parse(saved);
          setState((s) => ({ ...s, ...parsed, connectionState: "disconnected" }));
        }
      } catch {}
    })();
  }, []);

  const connect = (server: Server) => {
    setState((s) => ({ ...s, connectionState: "connecting", currentServer: server }));
    // Phase 2: call native VpnService / Network Extension here
    setTimeout(() => {
      setState((s) => ({
        ...s,
        connectionState: "connected",
        liveStats: { downBps: 2_500_000, upBps: 450_000, sessionSec: 0, ping: server.ping },
      }));
    }, 1200);
  };

  const disconnect = () => {
    setState((s) => ({ ...s, connectionState: "disconnected", liveStats: { downBps: 0, upBps: 0, sessionSec: 0, ping: 0 } }));
  };

  // Live ticker
  useEffect(() => {
    if (state.connectionState !== "connected") return;
    const t = setInterval(() => {
      setState((s) => ({
        ...s,
        liveStats: {
          ...s.liveStats,
          sessionSec: s.liveStats.sessionSec + 1,
          downBps: 1_000_000 + Math.floor(Math.random() * 4_000_000),
          upBps: 200_000 + Math.floor(Math.random() * 800_000),
        },
      }));
    }, 1000);
    return () => clearInterval(t);
  }, [state.connectionState]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.bgGradient} />

      {/* Header */}
      <Header version="1.0.0" />

      {/* Content */}
      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 80 }}>
        {state.view === "connect" && (
          <ConnectView state={state} onConnect={connect} onDisconnect={disconnect} onPickServer={() => setState((s) => ({ ...s, view: "servers" }))} />
        )}
        {state.view === "servers" && <ServersView onSelect={connect} onBack={() => setState((s) => ({ ...s, view: "connect" }))} />}
        {state.view === "speedtest" && <SpeedTestView server={state.currentServer} />}
        {state.view === "stats" && <StatsView />}
        {state.view === "settings" && <SettingsView />}
        {state.view === "account" && <AccountView />}
      </ScrollView>

      {/* Bottom navigation */}
      <BottomNav current={state.view} onNavigate={(v) => setState((s) => ({ ...s, view: v as AppState["view"] }))} />
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------
function Header({ version }: { version: string }) {
  return (
    <View style={styles.header}>
      <View style={styles.logoRow}>
        <View style={styles.logoMark}>
          <Text style={styles.logoLetter}>D</Text>
        </View>
        <View>
          <Text style={styles.brandName}>DISTORT</Text>
          <Text style={styles.tagline}>Freedom Beyond Borders</Text>
        </View>
      </View>
      <View style={styles.versionPill}>
        <Text style={styles.versionText}>v{version}</Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Connect View
// ---------------------------------------------------------------------------
function ConnectView({
  state,
  onConnect,
  onDisconnect,
  onPickServer,
}: {
  state: AppState;
  onConnect: (s: Server) => void;
  onDisconnect: () => void;
  onPickServer: () => void;
}) {
  const { connectionState, currentServer, liveStats } = state;
  const isConnected = connectionState === "connected";
  const isConnecting = connectionState === "connecting";

  return (
    <View style={styles.connectContainer}>
      {/* Status line */}
      <View style={styles.statusRow}>
        <View style={[styles.statusDot, { backgroundColor: isConnected ? COLORS.emerald : isConnecting ? COLORS.amber : COLORS.rose }]} />
        <Text style={styles.statusText}>
          {isConnected ? "Connected · secure tunnel active" : isConnecting ? "Establishing encrypted tunnel…" : "Not connected"}
        </Text>
      </View>

      {/* Power button */}
      <View style={styles.powerContainer}>
        <TouchableOpacity
          onPress={() => {
            if (isConnected) onDisconnect();
            else if (currentServer) onConnect(currentServer);
            else onPickServer();
          }}
          activeOpacity={0.9}
        >
          <LinearGradient
            colors={isConnected ? [COLORS.cyanSoft, COLORS.cyan, COLORS.blue, COLORS.violet] : [COLORS.surface2, COLORS.surface]}
            style={styles.powerButton}
          >
            <Power color={isConnected ? "#02131a" : COLORS.cyan} size={56} strokeWidth={2.2} />
            <Text style={[styles.powerLabel, { color: isConnected ? "#02131a" : COLORS.muted }]}>
              {isConnected ? "CONNECTED" : isConnecting ? "CONNECTING" : "TAP TO CONNECT"}
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* Server card */}
      <TouchableOpacity style={styles.serverCard} onPress={onPickServer}>
        <View style={styles.serverRow}>
          <Text style={styles.serverFlag}>{currentServer?.flag || "🌐"}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.serverCountry}>{currentServer?.country || "Select a server"}</Text>
            <Text style={styles.serverCity}>{currentServer ? `${currentServer.city} · ${currentServer.code}` : "Tap to choose"}</Text>
          </View>
          <Text style={[styles.serverPing, { color: pingColor(currentServer?.ping || 0) }]}>{currentServer ? `${currentServer.ping}ms` : "—"}</Text>
        </View>
      </TouchableOpacity>

      {/* Live metrics */}
      {isConnected && (
        <View style={styles.metricsGrid}>
          <Metric icon={<Activity color={COLORS.emerald} size={14} />} label="Down" value={fmtRate(liveStats.downBps)} color={COLORS.emerald} />
          <Metric icon={<Zap color={COLORS.cyan} size={14} />} label="Up" value={fmtRate(liveStats.upBps)} color={COLORS.cyan} />
          <Metric icon={<Activity color={COLORS.amber} size={14} />} label="Ping" value={`${liveStats.ping}ms`} color={COLORS.amber} />
          <Metric icon={<Shield color={COLORS.violet} size={14} />} label="Time" value={fmtDur(liveStats.sessionSec)} color={COLORS.violet} />
        </View>
      )}

      {/* Quick toggles */}
      <View style={styles.togglesRow}>
        <QuickToggle label="Kill Switch" on={true} color={COLORS.rose} />
        <QuickToggle label="Stealth" on={true} color={COLORS.violet} />
        <QuickToggle label="No Trackers" on={true} color={COLORS.cyan} />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Servers View
// ---------------------------------------------------------------------------
const DEMO_SERVERS: Server[] = [
  { id: "1", code: "tr-ist-01", country: "Turkey", city: "Istanbul", flag: "🇹🇷", ping: 18, stealth: true, premium: false },
  { id: "2", code: "ae-dxb-01", country: "UAE", city: "Dubai", flag: "🇦🇪", ping: 24, stealth: true, premium: false },
  { id: "3", code: "am-evn-01", country: "Armenia", city: "Yerevan", flag: "🇦🇲", ping: 28, stealth: true, premium: false },
  { id: "4", code: "ge-tbs-01", country: "Georgia", city: "Tbilisi", flag: "🇬🇪", ping: 32, stealth: true, premium: false },
  { id: "5", code: "de-fra-01", country: "Germany", city: "Frankfurt", flag: "🇩🇪", ping: 42, stealth: true, premium: false },
  { id: "6", code: "nl-ams-01", country: "Netherlands", city: "Amsterdam", flag: "🇳🇱", ping: 48, stealth: true, premium: false },
  { id: "7", code: "fi-hel-01", country: "Finland", city: "Helsinki", flag: "🇫🇮", ping: 55, stealth: true, premium: false },
  { id: "8", code: "fr-par-01", country: "France", city: "Paris", flag: "🇫🇷", ping: 44, stealth: true, premium: false },
  { id: "9", code: "us-nyc-01", country: "USA", city: "New York", flag: "🇺🇸", ping: 110, stealth: false, premium: false },
  { id: "10", code: "jp-tyo-01", country: "Japan", city: "Tokyo", flag: "🇯🇵", ping: 95, stealth: true, premium: false },
];

function ServersView({ onSelect, onBack }: { onSelect: (s: Server) => void; onBack: () => void }) {
  return (
    <View>
      <Text style={styles.sectionTitle}>Pick your exit</Text>
      <Text style={styles.sectionSub}>10 stealth-ready nodes · Iran-optimized</Text>
      {DEMO_SERVERS.map((s) => (
        <TouchableOpacity key={s.id} style={styles.serverCard} onPress={() => onSelect(s)}>
          <View style={styles.serverRow}>
            <Text style={styles.serverFlag}>{s.flag}</Text>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={styles.serverCountry}>{s.country}</Text>
                {s.stealth && (
                  <View style={styles.stealthBadge}>
                    <Shield color={COLORS.violet} size={10} />
                    <Text style={styles.stealthText}>STEALTH</Text>
                  </View>
                )}
              </View>
              <Text style={styles.serverCity}>{s.city} · {s.code}</Text>
            </View>
            <Text style={[styles.serverPing, { color: pingColor(s.ping) }]}>{s.ping}ms</Text>
          </View>
        </TouchableOpacity>
      ))}
      <TouchableOpacity style={styles.backButton} onPress={onBack}>
        <Text style={styles.backText}>← Back to dashboard</Text>
      </TouchableOpacity>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Speed Test View
// ---------------------------------------------------------------------------
function SpeedTestView({ server }: { server: Server | null }) {
  return (
    <View style={styles.centered}>
      <Zap color={COLORS.cyan} size={48} />
      <Text style={styles.sectionTitle}>Speed Test</Text>
      <Text style={styles.sectionSub}>
        {server ? `Target: ${server.flag} ${server.country}` : "Pick a server first"}
      </Text>
      <View style={styles.gaugePlaceholder}>
        <Text style={styles.gaugeValue}>—</Text>
        <Text style={styles.gaugeLabel}>Mbps</Text>
      </View>
      <Text style={styles.hintText}>Tap to measure real throughput (Phase 2)</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Stats View
// ---------------------------------------------------------------------------
function StatsView() {
  return (
    <View style={styles.centered}>
      <Activity color={COLORS.cyan} size={48} />
      <Text style={styles.sectionTitle}>Statistics</Text>
      <Text style={styles.sectionSub}>Your privacy, in numbers</Text>
      <View style={styles.metricsGrid}>
        <Metric icon={<Activity color={COLORS.emerald} size={14} />} label="Total Down" value="2.4 GB" color={COLORS.emerald} />
        <Metric icon={<Zap color={COLORS.cyan} size={14} />} label="Total Up" value="480 MB" color={COLORS.cyan} />
        <Metric icon={<Shield color={COLORS.violet} size={14} />} label="Time Online" value="3h 24m" color={COLORS.violet} />
        <Metric icon={<Globe color={COLORS.amber} size={14} />} label="Nodes" value="29 / 30" color={COLORS.amber} />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Settings View
// ---------------------------------------------------------------------------
function SettingsView() {
  return (
    <View style={styles.centered}>
      <Cog color={COLORS.cyan} size={48} />
      <Text style={styles.sectionTitle}>Settings</Text>
      <Text style={styles.sectionSub}>Tune your tunnel</Text>
      <View style={styles.togglesColumn}>
        <ToggleRow label="Kill Switch" desc="Block traffic if tunnel drops" />
        <ToggleRow label="Stealth Mode" desc="Prefer obfuscated nodes" />
        <ToggleRow label="DNS Leak Protection" desc="Force DNS through tunnel" />
        <ToggleRow label="Auto-Connect" desc="Connect on app launch" />
        <ToggleRow label="Block Trackers" desc="Drop tracker domains" />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Account View
// ---------------------------------------------------------------------------
function AccountView() {
  return (
    <View style={styles.centered}>
      <User color={COLORS.cyan} size={48} />
      <Text style={styles.sectionTitle}>Account</Text>
      <Text style={styles.sectionSub}>Free forever</Text>
      <View style={styles.accountCard}>
        <Text style={styles.accountName}>Distort Founder</Text>
        <Text style={styles.accountEmail}>founder@distort.app</Text>
        <View style={styles.tierBadge}>
          <Text style={styles.tierText}>FREE · 100%</Text>
        </View>
      </View>
      <Text style={styles.hintText}>Referral: distort.app/r/FREEDOM</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Bottom Navigation
// ---------------------------------------------------------------------------
function BottomNav({ current, onNavigate }: { current: string; onNavigate: (v: string) => void }) {
  const tabs = [
    { id: "connect", icon: Power, label: "Connect" },
    { id: "servers", icon: Server, label: "Servers" },
    { id: "speedtest", icon: Zap, label: "Speed" },
    { id: "stats", icon: Activity, label: "Stats" },
    { id: "settings", icon: Cog, label: "Settings" },
  ];
  return (
    <View style={styles.bottomNav}>
      {tabs.map((t) => {
        const Icon = t.icon;
        const active = current === t.id;
        return (
          <TouchableOpacity key={t.id} style={styles.navItem} onPress={() => onNavigate(t.id)}>
            <Icon color={active ? COLORS.cyan : COLORS.muted} size={22} />
            <Text style={[styles.navLabel, { color: active ? COLORS.cyan : COLORS.muted }]}>{t.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Small components
// ---------------------------------------------------------------------------
function Metric({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <View style={styles.metricCard}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 4 }}>
        {icon}
        <Text style={[styles.metricLabel, { color }]}>{label}</Text>
      </View>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function QuickToggle({ label, on, color }: { label: string; on: boolean; color: string }) {
  return (
    <View style={[styles.quickToggle, on ? { borderColor: color + "60", backgroundColor: color + "15" } : {}]}>
      <Shield color={on ? color : COLORS.muted} size={12} />
      <Text style={[styles.quickToggleText, { color: on ? color : COLORS.muted }]}>{label}</Text>
    </View>
  );
}

function ToggleRow({ label, desc }: { label: string; desc: string }) {
  const [on, setOn] = useState(true);
  return (
    <View style={styles.toggleRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.toggleLabel}>{label}</Text>
        <Text style={styles.toggleDesc}>{desc}</Text>
      </View>
      <TouchableOpacity onPress={() => setOn(!on)} style={[styles.toggleSwitch, on && { backgroundColor: COLORS.cyan }]}>
        <View style={[styles.toggleKnob, on && { transform: [{ translateX: 20 }] }]} />
      </TouchableOpacity>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function pingColor(p: number): string {
  if (p === 0) return COLORS.muted;
  if (p < 60) return COLORS.emerald;
  if (p < 120) return COLORS.amber;
  return COLORS.rose;
}

function fmtRate(bps: number): string {
  if (bps < 1000) return `${bps} b/s`;
  if (bps < 1_000_000) return `${(bps / 1000).toFixed(1)} KB/s`;
  return `${(bps / 1_000_000).toFixed(1)} MB/s`;
}

function fmtDur(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.void },
  bgGradient: {
    position: "absolute",
    top: 0, left: 0, right: 0, height: 400,
    backgroundColor: COLORS.blue,
    opacity: 0.15,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  logoRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  logoMark: {
    width: 36, height: 36,
    borderRadius: 10,
    backgroundColor: COLORS.cyan,
    alignItems: "center", justifyContent: "center",
  },
  logoLetter: {
    color: "#02131a",
    fontSize: 22,
    fontWeight: "900",
  },
  brandName: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 2,
  },
  tagline: {
    color: COLORS.muted,
    fontSize: 9,
    letterSpacing: 3,
    textTransform: "uppercase",
    marginTop: 2,
  },
  versionPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: "rgba(0,240,255,0.1)",
    borderWidth: 1,
    borderColor: "rgba(0,240,255,0.3)",
  },
  versionText: {
    color: COLORS.cyanSoft,
    fontSize: 10,
    fontWeight: "700",
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace" }),
  },
  content: { flex: 1, paddingHorizontal: 20 },
  // Connect view
  connectContainer: { paddingTop: 20, alignItems: "center" },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 20 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: {
    color: COLORS.muted,
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  powerContainer: { marginVertical: 20 },
  powerButton: {
    width: 200, height: 200,
    borderRadius: 100,
    alignItems: "center", justifyContent: "center",
    gap: 8,
  },
  powerLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  serverCard: {
    width: "100%",
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  serverRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  serverFlag: { fontSize: 28 },
  serverCountry: { color: COLORS.white, fontSize: 16, fontWeight: "700" },
  serverCity: { color: COLORS.muted, fontSize: 11, letterSpacing: 1, textTransform: "uppercase", marginTop: 2 },
  serverPing: { fontSize: 14, fontWeight: "700", fontFamily: Platform.select({ ios: "Menlo", android: "monospace" }) },
  stealthBadge: {
    flexDirection: "row", alignItems: "center", gap: 2,
    paddingHorizontal: 4, paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "rgba(139,92,246,0.4)",
    backgroundColor: "rgba(139,92,246,0.1)",
  },
  stealthText: { color: COLORS.violet, fontSize: 8, fontWeight: "700", letterSpacing: 1 },
  metricsGrid: {
    flexDirection: "row", flexWrap: "wrap",
    gap: 8, marginTop: 16, width: "100%",
  },
  metricCard: {
    flex: 1, minWidth: "45%",
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  metricLabel: { fontSize: 9, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase" },
  metricValue: { color: COLORS.white, fontSize: 16, fontWeight: "700", fontFamily: Platform.select({ ios: "Menlo", android: "monospace" }) },
  togglesRow: { flexDirection: "row", gap: 8, marginTop: 16, width: "100%" },
  quickToggle: {
    flex: 1,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4,
    paddingHorizontal: 8, paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  quickToggleText: { fontSize: 9, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase" },
  // Generic views
  centered: { alignItems: "center", paddingVertical: 30 },
  sectionTitle: { color: COLORS.white, fontSize: 22, fontWeight: "800", letterSpacing: 1, marginTop: 16 },
  sectionSub: { color: COLORS.muted, fontSize: 11, letterSpacing: 1, textTransform: "uppercase", marginTop: 4, marginBottom: 20 },
  gaugePlaceholder: {
    width: 200, height: 200,
    borderRadius: 100,
    borderWidth: 8,
    borderColor: "rgba(0,240,255,0.2)",
    alignItems: "center", justifyContent: "center",
    marginVertical: 20,
  },
  gaugeValue: { color: COLORS.white, fontSize: 48, fontWeight: "900" },
  gaugeLabel: { color: COLORS.muted, fontSize: 12, letterSpacing: 2, textTransform: "uppercase" },
  hintText: { color: COLORS.muted, fontSize: 11, marginTop: 8 },
  togglesColumn: { width: "100%", gap: 4 },
  toggleRow: {
    flexDirection: "row", alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  toggleLabel: { color: COLORS.white, fontSize: 14, fontWeight: "600" },
  toggleDesc: { color: COLORS.muted, fontSize: 11, marginTop: 2 },
  toggleSwitch: {
    width: 48, height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.1)",
    padding: 4,
    justifyContent: "center",
  },
  toggleKnob: {
    width: 20, height: 20,
    borderRadius: 10,
    backgroundColor: COLORS.white,
  },
  accountCard: {
    width: "100%",
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  accountName: { color: COLORS.white, fontSize: 18, fontWeight: "800" },
  accountEmail: { color: COLORS.muted, fontSize: 12, marginTop: 4 },
  tierBadge: {
    marginTop: 8,
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: "rgba(16,217,160,0.15)",
    borderWidth: 1,
    borderColor: "rgba(16,217,160,0.4)",
  },
  tierText: { color: COLORS.emerald, fontSize: 10, fontWeight: "700", letterSpacing: 1 },
  backButton: { marginTop: 20, alignSelf: "center" },
  backText: { color: COLORS.muted, fontSize: 12 },
  // Bottom nav
  bottomNav: {
    flexDirection: "row",
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.05)",
    paddingBottom: 8,
    paddingTop: 8,
  },
  navItem: { flex: 1, alignItems: "center", gap: 4 },
  navLabel: { fontSize: 9, fontWeight: "600", letterSpacing: 0.5 },
});
