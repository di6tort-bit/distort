// DISTORT — Client-side recovery engine
//
// THE ACTUAL RECOVERY LOOP. Runs entirely in the browser/app.
//
// Per the user's design (§3):
//   Start → Diagnose network → Gather options (local + remote) →
//   Validate + prioritize → Connect with real engine → Verify →
//   (success: monitor health) | (fail: try next or report no path)
//
// CRITICAL HONESTY RULES:
//   1. "connected" is ONLY set after a real HTTP request succeeds through
//      the tunnel AND the exit IP differs from the real IP.
//   2. If no path works, state goes to "exhausted" with a clear reason —
//      never a fake "connected".
//   3. The server's plan is a SUGGESTION — the client does its own probing.
//   4. No credentials are ever logged (use scrubSensitive on any string
//      before displaying or persisting).
//
// BROWSER LIMITATIONS (documented honestly):
//   - Cannot spawn xray-core (needs native process)
//   - Cannot open raw TCP sockets
//   - Cannot set system proxy (only chrome.proxy for the extension)
//   - CAN: diagnose network, validate config structure, fetch plan from API,
//     and — IF the desktop companion is running — delegate the actual
//     tunnel to it via the local SOCKS5 proxy at 127.0.0.1:10808.
//
// DESKTOP COMPANION BRIDGE:
//   When the Distort Desktop app is running, it exposes a local SOCKS5
//   proxy on 127.0.0.1:10808. The browser can route fetch requests through
//   it (via a PAC script or chrome.proxy.settings). If we detect the
//   companion is up, we can do real tunnel verification from the browser
//   by fetching through the SOCKS5 proxy and comparing the exit IP.
//
// WITHOUT DESKTOP COMPANION:
//   The browser cannot actually establish a VPN tunnel. In this case, the
//   engine diagnoses the network, lists available configs, but reports
//   honestly: "Install the desktop or Android app to actually connect.
//   The web dashboard can only diagnose and validate configs."

import {
  RecoveryState,
  RecoveryStatus,
  RecoveryAttempt,
  CandidatePath,
  RecoveryPlan,
  NetworkDiagnosis,
  TransportType,
} from "./types";
import { idleStatus, transition } from "./state-machine";
import { diagnoseClientSide, quickHealthCheck, onNetworkChange } from "./client-diagnostics";
import { getAllConfigs, toCandidate, markVerified, markFailed, StoredConfig } from "./local-config-store";

// ---------------------------------------------------------------------------
// Tunnel engine adapter (the abstraction over desktop/android/browser)
// ---------------------------------------------------------------------------

export type TunnelEngineResult = {
  // Whether the engine successfully started the tunnel
  started: boolean;
  // Whether a real HTTP request through the tunnel succeeded
  trafficVerified: boolean;
  // Exit IP discovered through the tunnel (null if not verified)
  exitIp: string | null;
  // Real IP (for leak detection — if exitIp == realIp, traffic isn't going through tunnel)
  realIp: string | null;
  // Error reason if failed (NO credentials)
  error: string | null;
  // Latency through the tunnel in ms
  latencyMs: number | null;
};

// The tunnel engine adapter. Different implementations for different platforms:
//   - BrowserWithoutCompanion: cannot connect at all — honest "install desktop app"
//   - BrowserWithCompanion: delegates to local SOCKS5 (127.0.0.1:10808)
//   - Desktop (Electron): spawns xray-core directly
//   - Android: starts VpnService with libxray.so
export interface TunnelEngine {
  // Platform name for logging
  readonly platform: string;
  // Whether this engine can actually establish tunnels
  readonly canConnect: boolean;
  // Start a tunnel with the given config URI + verify with real traffic
  connect(configUri: string, timeoutMs: number): Promise<TunnelEngineResult>;
  // Stop the current tunnel
  disconnect(): Promise<void>;
  // Check if the engine is currently running
  isRunning(): boolean;
}

// ---------------------------------------------------------------------------
// Browser tunnel engine (no companion) — honest limitation
// ---------------------------------------------------------------------------

export class BrowserOnlyEngine implements TunnelEngine {
  readonly platform = "browser-only";
  readonly canConnect = false;

  async connect(_configUri: string, _timeoutMs: number): Promise<TunnelEngineResult> {
    return {
      started: false,
      trafficVerified: false,
      exitIp: null,
      realIp: null,
      error: "The web dashboard cannot establish a VPN tunnel. Install the Distort Desktop or Android app for real connectivity. The browser can diagnose the network and validate config structure, but cannot spawn xray-core or open raw sockets.",
      latencyMs: null,
    };
  }

  async disconnect(): Promise<void> {
    // No-op — nothing to disconnect
  }

  isRunning(): boolean {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Browser + desktop companion engine (delegates to local SOCKS5)
// ---------------------------------------------------------------------------

export class BrowserWithCompanionEngine implements TunnelEngine {
  readonly platform = "browser-with-companion";
  readonly canConnect = true;
  private running = false;

  async connect(configUri: string, timeoutMs: number): Promise<TunnelEngineResult> {
    // The companion app (Distort Desktop) is running and exposes:
    //   - SOCKS5 at 127.0.0.1:10808
    //   - A control API at 127.0.0.1:10809 (HTTP)
    //
    // Steps:
    //   1. POST the configUri to the companion's control API
    //      (it spawns xray with that config)
    //   2. Wait for the companion to confirm xray started
    //   3. Fetch exit IP through the SOCKS5 proxy
    //   4. Fetch real IP directly (bypassing proxy)
    //   5. Compare — if different, tunnel is verified
    //
    // BROWSER LIMITATION: fetch() cannot use a SOCKS5 proxy directly.
    // We'd need chrome.proxy.settings (extension only) or a custom
    // SOCKS5-over-WebSocket bridge. For the extension, this works.
    // For the plain web app, we can only do the control API call.
    //
    // So in practice, this engine works ONLY in the Chrome extension context
    // (which has chrome.proxy.settings). The web dashboard falls back to
    // BrowserOnlyEngine.

    this.running = true;
    try {
      // Step 1: tell the companion to use this config
      const ctrlResp = await fetch("http://127.0.0.1:10809/api/tunnel/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ configUri }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!ctrlResp.ok) {
        return {
          started: false,
          trafficVerified: false,
          exitIp: null,
          realIp: null,
          error: `Companion control API returned ${ctrlResp.status}`,
          latencyMs: null,
        };
      }
      const ctrlData = await ctrlResp.json() as { ok: boolean; error?: string };

      if (!ctrlData.ok) {
        return {
          started: false,
          trafficVerified: false,
          exitIp: null,
          realIp: null,
          error: ctrlData.error || "Companion failed to start tunnel",
          latencyMs: null,
        };
      }

      // Step 2: the companion has started xray. Now we need to verify
      // traffic flows through it. But we can't use SOCKS5 from fetch()
      // directly in a web page. So we ask the companion to do the
      // verification for us and report back.
      const verifyResp = await fetch("http://127.0.0.1:10809/api/tunnel/verify", {
        method: "POST",
        signal: AbortSignal.timeout(timeoutMs),
      });
      const verifyData = await verifyResp.json() as {
        trafficVerified: boolean;
        exitIp: string | null;
        realIp: string | null;
        latencyMs: number | null;
        error?: string;
      };

      return {
        started: true,
        trafficVerified: verifyData.trafficVerified,
        exitIp: verifyData.exitIp,
        realIp: verifyData.realIp,
        error: verifyData.error || null,
        latencyMs: verifyData.latencyMs,
      };
    } catch (e) {
      const err = e as Error;
      return {
        started: false,
        trafficVerified: false,
        exitIp: null,
        realIp: null,
        error: `Companion unreachable: ${err.message}. Is the Distort Desktop app running?`,
        latencyMs: null,
      };
    } finally {
      this.running = false;
    }
  }

  async disconnect(): Promise<void> {
    try {
      await fetch("http://127.0.0.1:10809/api/tunnel/stop", { method: "POST" });
    } catch {
      // Best-effort
    }
    this.running = false;
  }

  isRunning(): boolean {
    return this.running;
  }
}

// Detect whether the desktop companion is running.
// Tries to hit the companion's health endpoint.
export async function detectCompanion(timeoutMs = 2000): Promise<boolean> {
  try {
    const resp = await fetch("http://127.0.0.1:10809/api/health", {
      signal: AbortSignal.timeout(timeoutMs),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

// Factory: pick the right engine for the current context.
export async function createTunnelEngine(): Promise<TunnelEngine> {
  // Only run this in the browser
  if (typeof window === "undefined") {
    // Server-side rendering — return a no-op engine
    return new BrowserOnlyEngine();
  }
  const companionUp = await detectCompanion();
  return companionUp
    ? new BrowserWithCompanionEngine()
    : new BrowserOnlyEngine();
}

// ---------------------------------------------------------------------------
// The recovery engine itself
// ---------------------------------------------------------------------------

export type RecoveryEventCallback = (status: RecoveryStatus) => void;

export type RecoveryEngineOptions = {
  // The tunnel engine to use (auto-detected if not provided)
  engine?: TunnelEngine;
  // Whether to fetch remote candidates from the API (default true)
  fetchRemoteCandidates?: boolean;
  // Max attempts override (default from policy)
  maxAttempts?: number;
  // Callback for status updates (for UI binding)
  onStatusChange?: RecoveryEventCallback;
};

export class RecoveryEngine {
  private status: RecoveryStatus;
  private engine: TunnelEngine | null = null;
  private onStatusChange: RecoveryEventCallback | null;
  private abortController: AbortController | null = null;
  private monitoringInterval: ReturnType<typeof setInterval> | null = null;
  private networkChangeCleanup: (() => void) | null = null;
  private fetchRemote: boolean;

  constructor(opts: RecoveryEngineOptions = {}) {
    this.status = idleStatus();
    this.engine = opts.engine || null;
    this.onStatusChange = opts.onStatusChange || null;
    this.fetchRemote = opts.fetchRemoteCandidates ?? true;
  }

  // Get current status (without triggering updates)
  getStatus(): RecoveryStatus {
    return { ...this.status };
  }

  // Update status + notify listeners
  private setStatus(newStatus: RecoveryStatus): void {
    this.status = newStatus;
    this.onStatusChange?.(newStatus);
  }

  private emit(event: Parameters<typeof transition>[1]): void {
    const newStatus = transition(this.status, event);
    if (newStatus !== this.status) {
      this.setStatus(newStatus);
    }
  }

  // Add an attempt to the log + report to server (best-effort)
  private logAttempt(attempt: RecoveryAttempt): void {
    this.status = {
      ...this.status,
      attempts: [attempt, ...this.status.attempts].slice(0, 50),
    };
    this.setStatus(this.status);

    // Best-effort report to server (don't block on it)
    if (typeof fetch !== "undefined") {
      fetch("/api/emergency/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId: attempt.planId,
          attempt: {
            candidateId: attempt.candidateId,
            candidateLabel: attempt.candidateLabel,
            attemptNumber: attempt.attemptNumber,
            state: attempt.state,
            result: attempt.result,
            reason: attempt.reason,
            latencyMs: attempt.latencyMs,
            startedAt: attempt.startedAt,
            endedAt: attempt.endedAt,
          },
        }),
      }).catch(() => {
        // Network may be down — that's OK, we keep the local log
      });
    }
  }

  // The main recovery cycle. Returns the final status.
  async recover(): Promise<RecoveryStatus> {
    // Set up abort signal
    this.abortController = new AbortController();

    // 1. Start → diagnosing
    this.emit({ type: "start" });

    // 2. Diagnose the network (real client-side probes)
    const diagnosis = await diagnoseClientSide();

    // 3. If no base network, fail closed immediately
    if (diagnosis.baseNetwork === "offline") {
      this.emit({
        type: "no-base-network",
        reason: "Device is offline (navigator.onLine=false). No network interface is active. Connect to Wi-Fi or mobile data, then retry.",
      });
      this.logAttempt({
        planId: "no-plan",
        candidateId: "none",
        candidateLabel: "Network diagnosis",
        attemptNumber: 1,
        state: "exhausted",
        result: "failure",
        reason: diagnosis.summary,
        latencyMs: null,
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
      });
      return this.getStatus();
    }

    // 4. Gather candidates: local configs first, then remote (if fetchable)
    const candidates = await this.gatherCandidates(diagnosis);

    if (candidates.length === 0) {
      this.emit({
        type: "no-candidates-left",
        reason: "No VPN configs available. Import a config from the Community Mesh tab or paste your own. Without at least one config, the recovery engine has nothing to try.",
      });
      this.logAttempt({
        planId: "no-plan",
        candidateId: "none",
        candidateLabel: "Candidate gathering",
        attemptNumber: 1,
        state: "exhausted",
        result: "failure",
        reason: "No candidates available locally or remotely.",
        latencyMs: null,
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
      });
      return this.getStatus();
    }

    // 5. Build the plan (client-side — we rank locally)
    const plan: RecoveryPlan = {
      planId: `plan_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      diagnosis,
      candidates,
      policy: {
        maxAttempts: 10,
        verifyTimeoutMs: 8000,
        baseDelayMs: 1500,
        maxDelayMs: 30000,
        maxConsecutiveFailures: 5,
        autoRetryAfterExhaustion: false,
        enforceKillSwitch: true,
        requireDnsLeakProtection: true,
      },
      rationale: `Client-side plan: ${candidates.length} candidates. Base network: ${diagnosis.baseNetwork}.`,
      confidence: candidates.length >= 5 ? "medium" : "low",
      createdAt: new Date().toISOString(),
      userTier: "free", // determined client-side; server verifies
    };

    this.status = { ...this.status, activePlan: plan, attemptsThisCycle: 0 };
    this.setStatus(this.status);

    // 6. Diagnosis complete → selecting
    this.emit({ type: "diagnosis-complete" });

    // 7. Try each candidate in sequence
    for (let i = 0; i < plan.candidates.length; i++) {
      if (this.abortController?.signal.aborted) break;

      const candidate = plan.candidates[i];
      const attemptNumber = i + 1;

      // Select this candidate
      this.emit({ type: "candidate-selected", candidate });

      // connecting
      const attemptStart = new Date().toISOString();

      // If the engine can't connect, fail honestly
      if (!this.engine || !this.engine.canConnect) {
        const reason = this.engine
          ? `Engine "${this.engine.platform}" cannot establish tunnels in this context.`
          : "No tunnel engine available.";

        this.emit({ type: "engine-failed", reason });

        this.logAttempt({
          planId: plan.planId,
          candidateId: candidate.id,
          candidateLabel: candidate.label,
          attemptNumber,
          state: "recovering",
          result: "failure",
          reason,
          latencyMs: null,
          startedAt: attemptStart,
          endedAt: new Date().toISOString(),
        });

        await markFailed(candidate.id);

        // Try next candidate
        const next = plan.candidates[i + 1];
        if (next) {
          // Backoff before next try
          await this.delay(1500);
          this.emit({ type: "next-candidate-available", candidate: next });
          continue;
        } else {
          this.emit({
            type: "no-candidates-left",
            reason: `All ${plan.candidates.length} candidates tried. Engine "${this.engine?.platform}" cannot establish tunnels. Install the Distort Desktop or Android app for real connectivity.`,
          });
          break;
        }
      }

      // Engine CAN connect — try it
      const result = await this.engine.connect(candidate.configUri, plan.policy.verifyTimeoutMs);

      if (result.started && result.trafficVerified && result.exitIp !== result.realIp) {
        // SUCCESS — tunnel verified, traffic flows, exit IP differs from real IP
        this.emit({
          type: "traffic-verified",
          exitIp: result.exitIp,
          exitCountry: null, // could do a lookup later
        });

        await markVerified(candidate.id);

        this.logAttempt({
          planId: plan.planId,
          candidateId: candidate.id,
          candidateLabel: candidate.label,
          attemptNumber,
          state: "connected",
          result: "success",
          reason: `Tunnel verified. Exit IP: ${result.exitIp}. Latency: ${result.latencyMs}ms.`,
          latencyMs: result.latencyMs,
          startedAt: attemptStart,
          endedAt: new Date().toISOString(),
        });

        // Start health monitoring
        this.startHealthMonitoring();
        return this.getStatus();
      }

      // FAILURE — either engine didn't start, traffic didn't verify, or leak detected
      let reason: string;
      if (!result.started) {
        reason = result.error || "Engine failed to start.";
      } else if (result.exitIp === result.realIp && result.exitIp !== null) {
        reason = `Traffic leak detected: exit IP (${result.exitIp}) equals real IP. Tunnel is not actually routing traffic.`;
      } else if (!result.trafficVerified) {
        reason = result.error || "Tunnel started but HTTP verification failed — server may be unreachable or credentials invalid.";
      } else {
        reason = result.error || "Unknown failure.";
      }

      this.emit({ type: "verification-failed", reason });

      await markFailed(candidate.id);

      this.logAttempt({
        planId: plan.planId,
        candidateId: candidate.id,
        candidateLabel: candidate.label,
        attemptNumber,
        state: "recovering",
        result: "failure",
        reason,
        latencyMs: result.latencyMs,
        startedAt: attemptStart,
        endedAt: new Date().toISOString(),
      });

      // Check exhaustion
      this.status = {
        ...this.status,
        attemptsThisCycle: attemptNumber,
      };
      if (attemptNumber >= plan.policy.maxAttempts) {
        this.emit({
          type: "no-candidates-left",
          reason: `Max attempts (${plan.policy.maxAttempts}) reached. ${attemptNumber} candidates tried, none verified. Last failure: ${reason}`,
        });
        break;
      }

      // Try next candidate
      const next = plan.candidates[i + 1];
      if (next) {
        // Exponential backoff
        const delayMs = Math.min(
          plan.policy.baseDelayMs * Math.pow(2, attemptNumber - 1),
          plan.policy.maxDelayMs
        );
        await this.delay(delayMs);
        this.emit({ type: "next-candidate-available", candidate: next });
      } else {
        this.emit({
          type: "no-candidates-left",
          reason: `All ${plan.candidates.length} candidates exhausted. None verified tunnel traffic. Install the Distort Desktop or Android app for real connectivity, or import fresh configs from the Community Mesh.`,
        });
        break;
      }
    }

    return this.getStatus();
  }

  // Gather candidates: local configs first (offline-available), then remote.
  private async gatherCandidates(diagnosis: NetworkDiagnosis): Promise<CandidatePath[]> {
    const candidates: CandidatePath[] = [];

    // 1. Local configs (from IndexedDB — available offline)
    try {
      const local = await getAllConfigs();
      // Sort: verified first, then by score
      const sorted = [...local].sort((a, b) => {
        if (a.lastVerifiedAt && !b.lastVerifiedAt) return -1;
        if (!a.lastVerifiedAt && b.lastVerifiedAt) return 1;
        return b.score - a.score;
      });
      for (const cfg of sorted) {
        candidates.push(this.storedToCandidate(cfg));
      }
    } catch {
      // IndexedDB not available — skip local configs
    }

    // 2. Remote configs (from API — only if internet is up)
    if (this.fetchRemote && diagnosis.internationalReachable) {
      try {
        const resp = await fetch("/api/imported-configs?bucket=optimized&limit=20");
        if (resp.ok) {
          const data = await resp.json() as { configs: Array<{
            id: string;
            protocol: string;
            uri: string;
            label: string | null;
            host: string;
            port: number;
            score: number;
            flags: string;
            country: string | null;
          }> };
          for (const cfg of data.configs) {
            // Don't duplicate configs we already have locally
            if (candidates.some((c) => c.id === cfg.id)) continue;
            const flagsArray = cfg.flags ? cfg.flags.split(",").filter(Boolean) : [];
            candidates.push({
              id: cfg.id,
              label: cfg.label || `${cfg.protocol} ${cfg.host}:${cfg.port}`,
              protocol: cfg.protocol as TransportType,
              host: cfg.host,
              port: cfg.port,
              stealth: flagsArray.some((f) => ["Reality", "TLS", "SNI", "Vision"].includes(f)),
              antiDpiScore: cfg.score,
              exitCountry: cfg.country,
              vipOnly: false,
              configUri: cfg.uri,
              lastProbe: null,
              successStreak: 0,
              failureStreak: 0,
              lastTriedAt: null,
            });
          }
        }
      } catch {
        // API unreachable — fall back to local only
      }
    }

    return candidates;
  }

  private storedToCandidate(cfg: StoredConfig): CandidatePath {
    const c = toCandidate(cfg);
    return {
      ...c,
      protocol: c.protocol as TransportType,
      lastProbe: cfg.lastVerifiedAt
        ? {
            configId: cfg.id,
            structural: "valid",
            reachability: "reachable",
            tunnel: "verified",
            latencyMs: null,
            exitIp: null,
            exitCountry: cfg.country,
            probedAt: cfg.lastVerifiedAt,
            failureReason: null,
          }
        : null,
    };
  }

  // Health monitoring — runs every 30s after connected.
  // Detects quality degradation and triggers recovery if needed.
  private startHealthMonitoring(): void {
    this.monitoringInterval = setInterval(async () => {
      if (this.status.state !== "connected" && this.status.state !== "degraded") {
        this.stopHealthMonitoring();
        return;
      }
      const health = await quickHealthCheck(3000);
      if (!health.online) {
        // Network dropped — trigger recovery
        this.emit({ type: "quality-dropped" });
        // Auto-recover after a short delay
        setTimeout(() => {
          if (this.status.state === "degraded") {
            this.recover().catch(() => {});
          }
        }, 2000);
      } else if (health.latencyMs !== null && health.latencyMs > 2000) {
        // High latency — degraded
        if (this.status.state === "connected") {
          this.emit({ type: "quality-dropped" });
        }
      } else {
        // Healthy — if we were degraded, recover
        if (this.status.state === "degraded") {
          this.emit({ type: "quality-recovered" });
        }
      }
    }, 30000);

    // Listen for network change events (Wi-Fi → mobile data switch)
    this.networkChangeCleanup = onNetworkChange(() => {
      // Re-diagnose on network change
      if (this.status.state === "connected") {
        this.emit({ type: "quality-dropped" });
        setTimeout(() => {
          if (this.status.state === "degraded") {
            this.recover().catch(() => {});
          }
        }, 1000);
      }
    });
  }

  private stopHealthMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    if (this.networkChangeCleanup) {
      this.networkChangeCleanup();
      this.networkChangeCleanup = null;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, Math.min(ms, 30000));
    });
  }

  // Manual disconnect
  async disconnect(): Promise<void> {
    this.stopHealthMonitoring();
    if (this.engine) {
      await this.engine.disconnect();
    }
    this.emit({ type: "disconnect" });
  }

  // Abort the current recovery cycle
  abort(): void {
    this.abortController?.abort();
    this.stopHealthMonitoring();
    this.emit({ type: "abort" });
  }

  // Reset to idle
  reset(): void {
    this.stopHealthMonitoring();
    this.abortController?.abort();
    this.emit({ type: "reset" });
  }

  // Initialize the engine (detect companion, etc.)
  async init(): Promise<void> {
    if (!this.engine) {
      this.engine = await createTunnelEngine();
    }
  }
}
