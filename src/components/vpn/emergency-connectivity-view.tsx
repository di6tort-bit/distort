'use client';

// DISTORT — Emergency Connectivity UI view
//
// Per design §7: exposes the Emergency Connectivity engine to the user.
// Honesty surface: the server cannot verify reachability from the user's
// device — the client (desktop/Android) must probe each candidate itself.
// This view shows: honesty banner, network diagnosis, recovery state
// machine badge, candidate paths (NO credentials), recovery log, manual
// actions (Recover / Import / Reset), and the Starlink/VIP notice.

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Cpu,
  Globe,
  Radio,
  ShieldCheck,
  Satellite,
  Zap,
  RefreshCw,
  Upload,
  RotateCcw,
  Crown,
  Server as ServerIcon,
  Wifi,
  Network,
} from "lucide-react";
import { toast } from "sonner";
import { useFetch, postJSON } from "@/hooks/use-fetch";
import type { ServerLite } from "@/lib/vpn-store";
import {
  RecoveryState,
  RecoveryPlan,
  RecoveryPolicy,
  CandidatePath,
  RecoveryAttempt,
  RECOVERY_STATE_LABELS,
  ValidateConfigResponse,
  StructuralValidity,
  ServerReachability,
  TunnelVerification,
  TransportType,
} from "@/lib/emergency-connectivity/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_EMAIL = "founder@distort.app";

function getUserEmail(): string {
  if (typeof window === "undefined") return DEFAULT_EMAIL;
  try {
    return window.localStorage.getItem("distortEmail") || DEFAULT_EMAIL;
  } catch {
    return DEFAULT_EMAIL;
  }
}

const PROTOCOL_LABEL: Record<TransportType, string> = {
  wireguard: "WireGuard",
  vless: "VLESS",
  vmess: "VMess",
  trojan: "Trojan",
  shadowsocks: "Shadowsocks",
  ssh: "SSH",
  satellite: "Satellite",
};

function protocolColor(p: TransportType): string {
  switch (p) {
    case "wireguard":
      return "#10d9a0";
    case "vless":
      return "#00f0ff";
    case "vmess":
      return "#2962ff";
    case "trojan":
      return "#8b5cf6";
    case "shadowsocks":
      return "#ffb020";
    case "ssh":
      return "#5cf2ff";
    case "satellite":
      return "#a78bfa";
    default:
      return "#8aa0c4";
  }
}

function confidenceColor(c: RecoveryPlan["confidence"]): string {
  switch (c) {
    case "high":
      return "#10d9a0";
    case "medium":
      return "#00f0ff";
    case "low":
      return "#ffb020";
    case "none":
    default:
      return "#ff4d6d";
  }
}

// Structural validity → label + color
function structuralBadge(s: StructuralValidity): { label: string; color: string } {
  switch (s) {
    case "valid":
      return { label: "STRUCT", color: "#10d9a0" };
    case "invalid-syntax":
      return { label: "STRUCT", color: "#ff4d6d" };
    case "missing-fields":
      return { label: "STRUCT", color: "#ffb020" };
    case "unsupported-protocol":
      return { label: "STRUCT", color: "#ff4d6d" };
    default:
      return { label: "STRUCT", color: "#8aa0c4" };
  }
}

function reachabilityBadge(r: ServerReachability): { label: string; color: string } {
  switch (r) {
    case "reachable":
      return { label: "REACH", color: "#10d9a0" };
    case "unreachable":
      return { label: "REACH", color: "#ff4d6d" };
    case "not-probed":
    default:
      return { label: "REACH", color: "#8aa0c4" };
  }
}

function tunnelBadge(t: TunnelVerification): { label: string; color: string } {
  switch (t) {
    case "verified":
      return { label: "TUNNEL", color: "#10d9a0" };
    case "traffic-failed":
      return { label: "TUNNEL", color: "#ff4d6d" };
    case "leak-detected":
      return { label: "TUNNEL", color: "#ff4d6d" };
    case "not-attempted":
    default:
      return { label: "TUNNEL", color: "#8aa0c4" };
  }
}

function scoreColor(score: number): string {
  if (score >= 80) return "#10d9a0";
  if (score >= 60) return "#00f0ff";
  if (score >= 40) return "#ffb020";
  return "#8aa0c4";
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

// ---------------------------------------------------------------------------
// Status response shape (from /api/emergency/status). The server returns the
// managed server pool + capability flags + notice — it does NOT return a
// live diagnosis because the server cannot probe from the user's device.
// The diagnosis comes back WITH the plan from /api/emergency/plan.
// ---------------------------------------------------------------------------

type ManagedServerLite = {
  id: string;
  code: string;
  country: string;
  city: string;
  flag: string;
  host: string;
  port: number;
  online: boolean;
  ping: number;
  load: number;
  stealth: boolean;
};

type EmergencyStatusResponse = {
  policy?: RecoveryPolicy;
  managedServers?: ManagedServerLite[];
  capabilities?: {
    satelliteAvailable: boolean;
    provisioningAvailable: boolean;
  };
  notice?: string;
};

type VipCheckResponse = {
  vip: boolean;
  tier: "free" | "vip" | "admin" | "none";
  isAdmin?: boolean;
  vipUntil?: string | null;
  message?: string;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EmergencyConnectivityView() {
  // User / tier state
  const [userEmail, setUserEmail] = useState<string>(DEFAULT_EMAIL);
  const [userTier, setUserTier] = useState<"free" | "vip" | "admin">("free");
  const [tierLoaded, setTierLoaded] = useState(false);

  // Recovery state (client-side visual until Phase 3 ships execution)
  const [recoveryState, setRecoveryState] = useState<RecoveryState>("idle");
  const [activePlan, setActivePlan] = useState<RecoveryPlan | null>(null);
  const [attempts, setAttempts] = useState<RecoveryAttempt[]>([]);
  const [lastStateChangeAt, setLastStateChangeAt] = useState<string>(
    new Date().toISOString()
  );

  // Recovery action flags
  const [planning, setPlanning] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [includeSatellite, setIncludeSatellite] = useState(false);

  // Import dialog state
  const [importOpen, setImportOpen] = useState(false);
  const [importUri, setImportUri] = useState("");
  const [importProbe, setImportProbe] = useState(true);
  const [validating, setValidating] = useState(false);
  const [validation, setValidation] = useState<ValidateConfigResponse | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Managed servers (from /api/servers — always exists)
  const serversState = useFetch<{ servers: ServerLite[] }>("/api/servers");
  const serverList = serversState.data?.servers ?? [];

  // Emergency status (from /api/emergency/status — may 404 during beta)
  const statusState = useFetch<EmergencyStatusResponse>("/api/emergency/status");

  // ---------------------------------------------------------------------------
  // Tier check on mount
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const email = getUserEmail();
    setUserEmail(email);
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(
          `/api/vip/check?email=${encodeURIComponent(email)}`,
          { headers: { "x-user-email": email } }
        );
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = (await r.json()) as VipCheckResponse;
        if (cancelled) return;
        const tier = data.isAdmin
          ? "admin"
          : data.tier === "vip"
          ? "vip"
          : "free";
        setUserTier(tier);
        if (tier !== "free") {
          // Default ON for VIP/admin — they paid for it
          setIncludeSatellite(true);
        }
      } catch {
        if (cancelled) return;
        // Default to free if the check fails — fail closed (no VIP)
        setUserTier("free");
      } finally {
        if (!cancelled) setTierLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const handleRecover = useCallback(async () => {
    setPlanError(null);
    setPlanning(true);
    setRecoveryState("diagnosing");
    setLastStateChangeAt(new Date().toISOString());
    try {
      const r = await postJSON<RecoveryPlan>("/api/emergency/plan", {
        includeSatellite: includeSatellite && userTier !== "free",
        includeVip: userTier !== "free",
        userTier,
        userEmail,
      });
      setActivePlan(r);
      setRecoveryState("selecting");
      setLastStateChangeAt(new Date().toISOString());
      const n = r.candidates?.length ?? 0;
      toast.success("Recovery plan ready", {
        description: `${n} candidate${n === 1 ? "" : "s"} · confidence ${r.confidence}`,
      });
    } catch (e) {
      const msg = (e as Error).message || "Plan request failed";
      setPlanError(msg);
      setRecoveryState("idle");
      setLastStateChangeAt(new Date().toISOString());
      toast.error("Could not build recovery plan", {
        description: `${msg} — the Emergency API may still be in beta.`,
      });
    } finally {
      setPlanning(false);
    }
  }, [includeSatellite, userTier, userEmail]);

  const handleReset = useCallback(() => {
    setRecoveryState("idle");
    setActivePlan(null);
    setAttempts([]);
    setPlanError(null);
    setLastStateChangeAt(new Date().toISOString());
    toast.info("Recovery state reset");
  }, []);

  const handleValidate = useCallback(async () => {
    if (!importUri.trim()) {
      setValidationError("Paste a config URI first");
      return;
    }
    setValidationError(null);
    setValidating(true);
    setValidation(null);
    try {
      const r = await postJSON<ValidateConfigResponse>(
        "/api/emergency/configs/validate",
        { input: importUri.trim(), probeReachability: importProbe }
      );
      setValidation(r);
      // NOTE: we intentionally do NOT show a toast here. Sonner toasts are
      // portaled to <body>, which can trigger Radix Dialog's outside-click
      // handler and close the dialog prematurely. The validation result is
      // already visible in the dialog (three status badges + parsed fields +
      // warnings), so a toast would be redundant.
    } catch (e) {
      const msg = (e as Error).message || "Validation request failed";
      setValidationError(msg);
      // Keep the dialog open on error — show the failure inline.
    } finally {
      setValidating(false);
    }
  }, [importUri, importProbe]);

  const handleAddFavorite = useCallback(() => {
    if (!validation) return;
    toast.success("Marked for import", {
      description:
        "Import to favorites will be wired up in Phase 4 (post-recovery).",
    });
  }, [validation]);

  const closeImport = useCallback(() => {
    setImportOpen(false);
    setImportUri("");
    setValidation(null);
    setValidationError(null);
  }, []);

  // ---------------------------------------------------------------------------
  // Derived display data
  // ---------------------------------------------------------------------------

  const stateMeta = RECOVERY_STATE_LABELS[recoveryState];
  const isFreeTier = userTier === "free";
  const isVipLike = userTier === "vip" || userTier === "admin";
  const statusData = statusState.data;
  const statusError = statusState.error;

  // Managed server pool — prefer /api/emergency/status (richer), fall back to
  // /api/servers (always available, has protocols).
  const emergencyServers = statusData?.managedServers ?? [];
  const managedTotal = emergencyServers.length || serverList.length;
  const managedOnline =
    emergencyServers.length > 0
      ? emergencyServers.filter((s) => s.online).length
      : serverList.filter((s) => s.online).length;
  const managedStealth =
    emergencyServers.length > 0
      ? emergencyServers.filter((s) => s.stealth).length
      : serverList.filter((s) => s.stealth).length;
  const managedProtocols = Array.from(
    new Set(serverList.flatMap((s) => s.protocols?.map((p) => p) ?? []))
  ).slice(0, 6);
  const satelliteAvailable = statusData?.capabilities?.satelliteAvailable ?? false;

  // Diagnosis only comes back WITH the plan (server can't probe user's device).
  const diagnosis = activePlan?.diagnosis ?? null;
  const candidates = activePlan?.candidates ?? [];

  return (
    <div className="space-y-4">
      {/* Honesty banner */}
      <Alert className="border-[#ffb020]/30 bg-[#ffb020]/[0.06] text-[#ffb020]">
        <AlertTriangle className="w-4 h-4" />
        <AlertTitle className="font-tech uppercase tracking-wider text-xs">
          Emergency Connectivity — Beta
        </AlertTitle>
        <AlertDescription className="text-[#eaf2ff]/80">
          Emergency Connectivity is in beta. The server cannot verify
          reachability from your device — the client (desktop or Android app)
          must probe each candidate itself. No credentials are ever logged.
        </AlertDescription>
      </Alert>

      {/* Tier notice — satellite / VIP */}
      {tierLoaded && isFreeTier && (
        <Alert className="border-[#8b5cf6]/30 bg-[#8b5cf6]/[0.06] text-[#a78bfa]">
          <Satellite className="w-4 h-4" />
          <AlertTitle className="font-tech uppercase tracking-wider text-xs">
            Satellite (Starlink) — VIP only
          </AlertTitle>
          <AlertDescription className="text-[#eaf2ff]/80">
            🛰️ Satellite (Starlink) paths are VIP-only. Upgrade to access
            off-grid resilience paths via the Account tab.
          </AlertDescription>
        </Alert>
      )}
      {tierLoaded && isVipLike && (
        <Card className="glass border-white/5">
          <CardContent className="p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-[#8b5cf6]/10 border border-[#8b5cf6]/30 text-[#a78bfa] flex items-center justify-center shrink-0">
                <Satellite className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-white flex items-center gap-2">
                  Include satellite paths in plan
                  <Badge
                    variant="outline"
                    className="text-[9px] font-tech uppercase tracking-wider h-4 border-[#8b5cf6]/30 text-[#a78bfa]"
                  >
                    {userTier === "admin" ? "ADMIN" : "VIP"}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  Starlink paths are reserved and never a dependency — the
                  engine works entirely without them.
                </div>
                {tierLoaded && isVipLike && !satelliteAvailable && (
                  <div className="text-[10px] text-[#ffb020]/80 mt-1">
                    ⚠ Real Starlink infra is Phase 5 — candidates may appear
                    but the client rejects them at the connecting stage.
                  </div>
                )}
              </div>
            </div>
            <Switch
              checked={includeSatellite}
              onCheckedChange={setIncludeSatellite}
              aria-label="Include satellite paths"
            />
          </CardContent>
        </Card>
      )}

      {/* Action bar */}
      <Card className="glass border-white/5">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              onClick={handleRecover}
              disabled={planning || recoveryState === "diagnosing" || recoveryState === "selecting"}
              className="bg-brand-gradient text-[#02131a] hover:opacity-90 font-tech uppercase tracking-wider text-xs h-9"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 mr-1.5 ${
                  planning ? "animate-spin" : ""
                }`}
              />
              {planning
                ? "Building plan…"
                : recoveryState === "selecting"
                ? "Plan ready"
                : "Recover Connection"}
            </Button>
            <Button
              type="button"
              onClick={() => setImportOpen(true)}
              variant="outline"
              className="border-[#00f0ff]/30 text-[#5cf2ff] hover:bg-[#00f0ff]/10 font-tech uppercase tracking-wider text-xs h-9"
            >
              <Upload className="w-3.5 h-3.5 mr-1.5" /> Import Config
            </Button>
            <Button
              type="button"
              onClick={handleReset}
              variant="outline"
              disabled={recoveryState === "idle" && !activePlan && !attempts.length}
              className="border-white/10 text-muted-foreground hover:text-white font-tech uppercase tracking-wider text-xs h-9"
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Reset
            </Button>
            <div className="ml-auto flex items-center gap-2 text-[10px] font-tech uppercase tracking-wider text-muted-foreground">
              <Cpu className="w-3 h-3 text-[#00f0ff]" />
              Tier:{" "}
              <span
                className={
                  isVipLike ? "text-[#a78bfa]" : "text-muted-foreground"
                }
              >
                {tierLoaded ? userTier.toUpperCase() : "…"}
              </span>
            </div>
          </div>
          {planError && (
            <div className="mt-3 text-xs text-[#ff4d6d] font-mono">
              ⚠ {planError}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Top grid: diagnosis + state machine */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <NetworkDiagnosisCard
          statusError={statusError}
          statusLoading={statusState.loading}
          diagnosis={diagnosis}
          managedTotal={managedTotal}
          managedOnline={managedOnline}
          managedStealth={managedStealth}
          managedProtocols={managedProtocols}
        />

        <RecoveryStateCard
          state={recoveryState}
          stateMeta={stateMeta}
          lastStateChangeAt={lastStateChangeAt}
          activePlan={activePlan}
        />
      </div>

      {/* Candidate paths */}
      <CandidatePathsCard candidates={candidates} />

      {/* Recovery log */}
      <RecoveryLogCard attempts={attempts} />

      {/* Import dialog */}
      <Dialog open={importOpen} onOpenChange={(o) => (o ? setImportOpen(true) : closeImport())}>
        <DialogContent className="sm:max-w-xl bg-[#0d1426] border-white/10 text-white">
          <DialogHeader>
            <DialogTitle className="font-display tracking-wider text-lg flex items-center gap-2">
              <Upload className="w-4 h-4 text-[#00f0ff]" />
              Import Config
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-xs">
              Paste a VLESS / VMess / Trojan / Shadowsocks URI. The Distort
              parser will check structure, optionally probe reachability, and
              show the three independent states. Credentials are never logged.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <Label className="text-xs font-tech uppercase tracking-wider text-muted-foreground mb-1.5">
                Config URI
              </Label>
              <Textarea
                value={importUri}
                onChange={(e) => setImportUri(e.target.value)}
                placeholder="vless://[UUID]@host:443?security=reality&sni=…"
                className="bg-white/[0.03] border-white/10 focus-visible:border-[#00f0ff]/50 font-mono text-xs min-h-[96px]"
                spellCheck={false}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
              <Label
                htmlFor="probe-toggle"
                className="text-xs font-tech uppercase tracking-wider text-muted-foreground cursor-pointer"
              >
                Also probe reachability (TCP connect)
              </Label>
              <Switch
                id="probe-toggle"
                checked={importProbe}
                onCheckedChange={setImportProbe}
              />
            </div>

            {validationError && (
              <div className="text-xs text-[#ff4d6d] font-mono">
                ⚠ {validationError}
              </div>
            )}

            {validation && (
              <ValidationResult
                v={validation}
                onAddFavorite={handleAddFavorite}
              />
            )}
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" className="font-tech uppercase tracking-wider text-xs h-9">
                Close
              </Button>
            </DialogClose>
            <Button
              type="button"
              onClick={handleValidate}
              disabled={validating}
              className="bg-brand-gradient text-[#02131a] hover:opacity-90 font-tech uppercase tracking-wider text-xs h-9"
            >
              <ShieldCheck className="w-3.5 h-3.5 mr-1.5" />
              {validating ? "Validating…" : "Validate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function NetworkDiagnosisCard({
  statusError,
  statusLoading,
  diagnosis,
  managedTotal,
  managedOnline,
  managedStealth,
  managedProtocols,
}: {
  statusError: string | null;
  statusLoading: boolean;
  diagnosis: RecoveryPlan["diagnosis"] | null;
  managedTotal: number;
  managedOnline: number;
  managedStealth: number;
  managedProtocols: string[];
}) {
  return (
    <Card className="glass border-white/5">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="font-display tracking-wider text-sm flex items-center gap-2">
            <Globe className="w-4 h-4 text-[#00f0ff]" /> Network Diagnosis
          </CardTitle>
          <Badge
            variant="outline"
            className={`text-[9px] font-tech uppercase tracking-wider h-4 ${
              diagnosis
                ? "border-[#10d9a0]/30 text-[#10d9a0]"
                : "border-white/10 text-muted-foreground"
            }`}
          >
            {diagnosis ? "live" : "no probe yet"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Managed server pool summary */}
        <div className="grid grid-cols-3 gap-2">
          <Kpi
            icon={<ServerIcon className="w-3 h-3" />}
            label="Managed"
            value={`${managedTotal}`}
            color="#00f0ff"
          />
          <Kpi
            icon={<CheckCircle2 className="w-3 h-3" />}
            label="Online"
            value={`${managedOnline}`}
            color="#10d9a0"
          />
          <Kpi
            icon={<ShieldCheck className="w-3 h-3" />}
            label="Stealth"
            value={`${managedStealth}`}
            color="#8b5cf6"
          />
        </div>

        {/* Capabilities */}
        {managedProtocols.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-tech uppercase tracking-wider text-muted-foreground">
              Protocols:
            </span>
            {managedProtocols.map((p) => (
              <Badge
                key={p}
                variant="outline"
                className="text-[9px] font-tech uppercase tracking-wider h-4 border-white/10 text-muted-foreground"
              >
                {p}
              </Badge>
            ))}
          </div>
        )}

        {/* Live diagnosis (DNS / reachability / latency) */}
        {statusLoading ? (
          <div className="space-y-1.5">
            <div className="h-3 rounded bg-white/5 animate-pulse" />
            <div className="h-3 rounded bg-white/5 animate-pulse w-3/4" />
          </div>
        ) : diagnosis ? (
          <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3 space-y-2">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <DiagRow
                icon={<Wifi className="w-3 h-3" />}
                label="Base network"
                value={diagnosis.baseNetwork}
                ok={diagnosis.baseNetwork === "online"}
              />
              <DiagRow
                icon={<Globe className="w-3 h-3" />}
                label="DNS"
                value={diagnosis.dnsWorks ? "works" : "broken"}
                ok={diagnosis.dnsWorks}
              />
              <DiagRow
                icon={<Network className="w-3 h-3" />}
                label="International"
                value={diagnosis.internationalReachable ? "reachable" : "blocked"}
                ok={diagnosis.internationalReachable}
              />
              <DiagRow
                icon={<Zap className="w-3 h-3" />}
                label="Latency"
                value={
                  diagnosis.directLatencyMs === null
                    ? "—"
                    : `${diagnosis.directLatencyMs}ms`
                }
                ok={
                  diagnosis.directLatencyMs !== null &&
                  diagnosis.directLatencyMs < 200
                }
              />
            </div>
            {diagnosis.summary && (
              <div className="text-[11px] text-muted-foreground pt-1 border-t border-white/5">
                {diagnosis.summary}
              </div>
            )}
          </div>
        ) : statusError ? (
          <div className="rounded-lg border border-[#ffb020]/20 bg-[#ffb020]/[0.04] p-3 text-[11px] text-[#ffb020]/90">
            Emergency status endpoint returned an error ({statusError}). The
            managed server pool above is from /api/servers. Build a plan to
            get the diagnosis from the planner.
          </div>
        ) : (
          <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3 text-[11px] text-muted-foreground">
            No diagnosis yet. The server cannot probe your device — click{" "}
            <span className="text-[#5cf2ff]">Recover Connection</span> to build
            a plan. The plan returns a diagnosis with the candidate list.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RecoveryStateCard({
  state,
  stateMeta,
  lastStateChangeAt,
  activePlan,
}: {
  state: RecoveryState;
  stateMeta: { label: string; color: string; description: string };
  lastStateChangeAt: string;
  activePlan: RecoveryPlan | null;
}) {
  return (
    <Card className="glass border-white/5">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="font-display tracking-wider text-sm flex items-center gap-2">
            <Activity className="w-4 h-4 text-[#00f0ff]" /> Recovery State
          </CardTitle>
          <span className="text-[10px] text-muted-foreground font-tech uppercase tracking-wider flex items-center gap-1">
            <Clock className="w-2.5 h-2.5" />
            {formatTime(lastStateChangeAt)}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div
          className="rounded-lg border p-3"
          style={{
            borderColor: `${stateMeta.color}40`,
            background: `${stateMeta.color}10`,
          }}
        >
          <div className="flex items-center gap-2.5">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full"
              style={{
                background: stateMeta.color,
                boxShadow: state !== "idle" ? `0 0 12px ${stateMeta.color}` : "none",
              }}
            />
            <span
              className="font-display font-bold text-lg"
              style={{ color: stateMeta.color }}
            >
              {stateMeta.label}
            </span>
            {state === "exhausted" && (
              <AlertTriangle className="w-4 h-4 text-[#ff4d6d] ml-auto" />
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {stateMeta.description}
          </p>
        </div>

        {activePlan && (
          <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-tech uppercase tracking-wider text-muted-foreground">
                Plan
              </span>
              <Badge
                variant="outline"
                className="text-[9px] font-mono border-white/10 text-muted-foreground"
              >
                {activePlan.planId.slice(0, 8)}
              </Badge>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Confidence</span>
              <span
                className="font-mono font-bold uppercase"
                style={{ color: confidenceColor(activePlan.confidence) }}
              >
                {activePlan.confidence}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Candidates</span>
              <span className="font-mono text-white">
                {activePlan.candidates.length}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Max attempts</span>
              <span className="font-mono text-white">
                {activePlan.policy.maxAttempts}
              </span>
            </div>
            {activePlan.rationale && (
              <div className="text-[11px] text-muted-foreground pt-1.5 mt-1.5 border-t border-white/5">
                {activePlan.rationale}
              </div>
            )}
          </div>
        )}

        {/* Mini state map */}
        <div className="flex items-center gap-1 flex-wrap text-[9px] font-tech uppercase tracking-wider">
          {(["idle", "diagnosing", "selecting", "connecting", "verifying", "connected", "degraded", "recovering", "exhausted"] as RecoveryState[]).map(
            (s, i, arr) => (
              <span key={s} className="flex items-center gap-1">
                <span
                  className={`px-1.5 py-0.5 rounded border ${
                    state === s
                      ? "border-current"
                      : "border-white/10 text-muted-foreground/60"
                  }`}
                  style={
                    state === s
                      ? { color: RECOVERY_STATE_LABELS[s].color }
                      : undefined
                  }
                >
                  {RECOVERY_STATE_LABELS[s].label}
                </span>
                {i < arr.length - 1 && (
                  <span className="text-muted-foreground/30">→</span>
                )}
              </span>
            )
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function CandidatePathsCard({ candidates }: { candidates: CandidatePath[] }) {
  return (
    <Card className="glass border-white/5">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="font-display tracking-wider text-sm flex items-center gap-2">
            <Radio className="w-4 h-4 text-[#8b5cf6]" /> Candidate Paths
            <span className="text-xs text-muted-foreground font-tech">
              · {candidates.length}
            </span>
          </CardTitle>
          <span className="text-[10px] text-muted-foreground font-tech uppercase tracking-wider">
            Ordered · best first
          </span>
        </div>
      </CardHeader>
      <CardContent>
        {candidates.length === 0 ? (
          <div className="text-center py-10">
            <Radio className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              No candidates yet.
            </p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Click <span className="text-[#5cf2ff]">Recover Connection</span>{" "}
              to build a recovery plan. The server returns an ordered candidate
              list — the client must probe each one.
            </p>
          </div>
        ) : (
          <div className="max-h-[560px] overflow-y-auto pr-1 -mr-1 space-y-2">
            {candidates.map((c, i) => (
              <CandidateRow key={c.id} c={c} index={i} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CandidateRow({ c, index }: { c: CandidatePath; index: number }) {
  const protoColor = protocolColor(c.protocol);
  const struct = structuralBadge(c.lastProbe?.structural ?? "valid");
  const reach = reachabilityBadge(c.lastProbe?.reachability ?? "not-probed");
  const tunnel = tunnelBadge(c.lastProbe?.tunnel ?? "not-attempted");
  const notProbed = !c.lastProbe;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.02, 0.4) }}
      className="rounded-xl border border-white/5 bg-white/[0.02] hover:border-[#00f0ff]/20 hover:bg-white/[0.04] transition-colors p-3"
    >
      <div className="flex items-center gap-3">
        {/* Rank */}
        <div className="w-7 h-7 rounded-md bg-white/[0.03] border border-white/10 flex items-center justify-center shrink-0">
          <span className="text-[11px] font-mono font-bold text-muted-foreground">
            {index + 1}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-white text-sm truncate">
              {c.label}
            </span>
            <Badge
              variant="outline"
              className="text-[9px] font-tech uppercase tracking-wider h-4"
              style={{
                borderColor: `${protoColor}40`,
                color: protoColor,
              }}
            >
              {c.protocol === "satellite" ? "🛰️ " : ""}
              {PROTOCOL_LABEL[c.protocol]}
            </Badge>
            {c.stealth && (
              <Badge
                variant="outline"
                className="text-[9px] font-tech uppercase tracking-wider h-4 border-[#8b5cf6]/30 text-[#a78bfa]"
              >
                <ShieldCheck className="w-2.5 h-2.5 mr-0.5" />Stealth
              </Badge>
            )}
            {c.vipOnly && (
              <Badge
                variant="outline"
                className="text-[9px] font-tech uppercase tracking-wider h-4 border-[#ffb020]/30 text-[#ffb020]"
              >
                <Crown className="w-2.5 h-2.5 mr-0.5" />VIP
              </Badge>
            )}
            {c.exitCountry && (
              <Badge
                variant="outline"
                className="text-[9px] font-mono uppercase tracking-wider h-4 border-white/10 text-muted-foreground"
              >
                {c.exitCountry}
              </Badge>
            )}
          </div>
          <div className="text-[11px] text-muted-foreground font-mono truncate mt-0.5">
            {c.host}:{c.port}
            {c.lastProbe?.latencyMs !== null &&
              c.lastProbe?.latencyMs !== undefined && (
                <span className="text-muted-foreground/70">
                  {" "}
                  · {c.lastProbe.latencyMs}ms
                </span>
              )}
            {c.lastProbe?.exitIp && (
              <span className="text-[#10d9a0]/80">
                {" "}
                · exit {c.lastProbe.exitIp}
              </span>
            )}
          </div>
        </div>

        {/* Three independent status badges */}
        <div className="flex items-center gap-1.5 shrink-0">
          <StatusBadge label={struct.label} color={struct.color} dim={notProbed} />
          <StatusBadge label={reach.label} color={reach.color} dim={notProbed || c.lastProbe?.reachability === "not-probed"} />
          <StatusBadge
            label={tunnel.label}
            color={tunnel.color}
            dim={notProbed || c.lastProbe?.tunnel === "not-attempted"}
          />
        </div>

        {/* Anti-DPI score */}
        <div className="text-center shrink-0 ml-1">
          <div
            className="font-mono text-sm font-bold"
            style={{ color: scoreColor(c.antiDpiScore) }}
          >
            {c.antiDpiScore}
          </div>
          <div className="text-[9px] text-muted-foreground font-tech uppercase tracking-wider">
            anti-dpi
          </div>
        </div>
      </div>

      {c.lastProbe?.failureReason && (
        <div className="mt-2 text-[10px] text-[#ff4d6d]/90 font-mono pl-10">
          ⚠ {c.lastProbe.failureReason}
        </div>
      )}
    </motion.div>
  );
}

function StatusBadge({
  label,
  color,
  dim,
}: {
  label: string;
  color: string;
  dim?: boolean;
}) {
  return (
    <span
      className={`px-1.5 py-0.5 rounded border text-[9px] font-tech uppercase tracking-wider ${
        dim ? "opacity-50" : ""
      }`}
      style={{
        borderColor: `${color}40`,
        color,
      }}
    >
      {label}
    </span>
  );
}

function RecoveryLogCard({ attempts }: { attempts: RecoveryAttempt[] }) {
  return (
    <Card className="glass border-white/5">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="font-display tracking-wider text-sm flex items-center gap-2">
            <Clock className="w-4 h-4 text-[#ffb020]" /> Recovery Log
            <span className="text-xs text-muted-foreground font-tech">
              · {attempts.length}
            </span>
          </CardTitle>
          <span className="text-[10px] text-muted-foreground font-tech uppercase tracking-wider">
            NO credentials logged
          </span>
        </div>
      </CardHeader>
      <CardContent>
        {attempts.length === 0 ? (
          <div className="text-center py-10">
            <Clock className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              Recovery attempts will appear here once the client executes the
              plan.
            </p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Each attempt logs: timestamp, candidate, result, reason — never
              the config URI or credentials.
            </p>
          </div>
        ) : (
          <div className="max-h-[400px] overflow-y-auto pr-1 -mr-1 space-y-1.5">
            {attempts.map((a, i) => (
              <AttemptRow key={`${a.planId}-${a.attemptNumber}-${i}`} a={a} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AttemptRow({ a }: { a: RecoveryAttempt }) {
  const color =
    a.result === "success"
      ? "#10d9a0"
      : a.result === "failure"
      ? "#ff4d6d"
      : a.result === "in-progress"
      ? "#00f0ff"
      : "#8aa0c4";
  return (
    <div className="rounded-lg border border-white/5 bg-white/[0.02] p-2.5 flex items-start gap-3 text-xs">
      <span
        className="inline-block w-2 h-2 rounded-full mt-1.5 shrink-0"
        style={{ background: color }}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-muted-foreground text-[10px]">
            {formatTime(a.startedAt)}
          </span>
          <span className="font-mono text-white text-[11px] truncate">
            {a.candidateId}
          </span>
          <Badge
            variant="outline"
            className="text-[9px] font-tech uppercase tracking-wider h-4"
            style={{ borderColor: `${color}40`, color }}
          >
            {a.result}
          </Badge>
          <Badge
            variant="outline"
            className="text-[9px] font-tech uppercase tracking-wider h-4 border-white/10 text-muted-foreground"
          >
            #{a.attemptNumber}
          </Badge>
          {a.latencyMs !== null && a.latencyMs !== undefined && (
            <span className="font-mono text-[10px] text-muted-foreground">
              {a.latencyMs}ms
            </span>
          )}
        </div>
        {a.reason && (
          <div className="text-[10px] text-muted-foreground mt-1 pl-1">
            {a.reason}
          </div>
        )}
      </div>
    </div>
  );
}

function ValidationResult({
  v,
  onAddFavorite,
}: {
  v: ValidateConfigResponse;
  onAddFavorite: () => void;
}) {
  const struct = structuralBadge(v.structural);
  const reach = reachabilityBadge(v.reachability);
  const tunnel = tunnelBadge(v.tunnel);
  const parsed = v.parsed;

  return (
    <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3 space-y-2.5">
      <div className="flex items-center gap-1.5">
        <StatusBadge label={struct.label} color={struct.color} />
        <StatusBadge label={reach.label} color={reach.color} dim={v.reachability === "not-probed"} />
        <StatusBadge label={tunnel.label} color={tunnel.color} dim />
        {v.latencyMs !== null && v.latencyMs !== undefined && (
          <span className="font-mono text-[10px] text-[#10d9a0] ml-auto">
            {v.latencyMs}ms
          </span>
        )}
      </div>

      {v.summary && (
        <div className="text-[11px] text-muted-foreground">{v.summary}</div>
      )}

      {parsed && (
        <div className="grid grid-cols-2 gap-1.5 text-[11px] font-mono">
          {parsed.host && (
            <Field label="host" value={`${parsed.host}:${parsed.port ?? "?"}`} />
          )}
          {parsed.network && (
            <Field label="network" value={parsed.network} />
          )}
          {parsed.security && (
            <Field label="security" value={parsed.security} />
          )}
          {parsed.sni && <Field label="sni" value={parsed.sni} />}
          <Field
            label="creds"
            value={parsed.hasRequiredCredentials ? "present" : "missing"}
            color={
              parsed.hasRequiredCredentials ? "#10d9a0" : "#ffb020"
            }
          />
          <Field
            label="anti-dpi"
            value={`${parsed.antiDpiScore}`}
            color={scoreColor(parsed.antiDpiScore)}
          />
        </div>
      )}

      {parsed?.flags && parsed.flags.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap">
          {parsed.flags.map((f) => (
            <Badge
              key={f}
              variant="outline"
              className="text-[9px] font-tech uppercase tracking-wider h-4 border-[#00f0ff]/30 text-[#5cf2ff]"
            >
              {f}
            </Badge>
          ))}
        </div>
      )}

      {v.warnings.length > 0 && (
        <div className="space-y-1">
          {v.warnings.map((w, i) => (
            <div
              key={i}
              className="text-[10px] text-[#ffb020] font-mono flex items-start gap-1"
            >
              <AlertTriangle className="w-2.5 h-2.5 mt-0.5 shrink-0" />
              {w}
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 pt-1.5 border-t border-white/5">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onAddFavorite}
          disabled={v.structural !== "valid"}
          className="font-tech uppercase tracking-wider text-[10px] h-7 border-[#00f0ff]/30 text-[#5cf2ff] hover:bg-[#00f0ff]/10"
        >
          <Crown className="w-3 h-3 mr-1" /> Add to favorites
        </Button>
        <span className="text-[10px] text-muted-foreground/70">
          actual import is Phase 4
        </span>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <span className="text-muted-foreground/70 text-[9px] uppercase tracking-wider font-tech">
        {label}:
      </span>
      <span
        className="text-white truncate"
        style={color ? { color } : undefined}
      >
        {value}
      </span>
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="rounded-lg border border-white/5 bg-white/[0.02] px-2.5 py-2">
      <div
        className="flex items-center gap-1 text-[10px] uppercase tracking-wider font-tech"
        style={{ color }}
      >
        {icon}
        {label}
      </div>
      <div className="font-mono text-sm font-semibold mt-0.5 text-white">
        {value}
      </div>
    </div>
  );
}

function DiagRow({
  icon,
  label,
  value,
  ok,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  ok: boolean;
}) {
  const color = ok ? "#10d9a0" : "#ff4d6d";
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-muted-foreground text-[10px] font-tech uppercase tracking-wider flex-1">
        {label}
      </span>
      <span className="font-mono text-xs font-semibold" style={{ color }}>
        {value}
      </span>
    </div>
  );
}
