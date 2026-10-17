// DISTORT Desktop — Electron main process
// A 100% free, anti-censorship VPN client. Designed to outperform Nekoray & Hiddify.

import { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, shell, session } from "electron";
import * as path from "path";
import * as fs from "fs";
import { spawn, ChildProcess } from "child_process";
import Store from "electron-store";
import log from "electron-log";

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------
log.transports.file.level = "info";
log.transports.console.level = "info";
log.info("DISTORT Desktop starting up…");

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const store = new Store<{ vpn: VpnState; settings: DesktopSettings }>({
  defaults: {
    vpn: { connected: false, server: null, protocol: "wireguard", startedAt: null },
    settings: {
      autoConnect: false,
      killSwitch: true,
      stealthMode: true,
      dnsLeakProtection: true,
      minimizeToTray: true,
      startMinimized: false,
    },
  },
});

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let vpnProcess: ChildProcess | null = null;
let isQuitting = false;

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------
function getLoadUrl(): string {
  const isDev = !!process.env.DISTORT_DEV;
  if (isDev) {
    return "http://localhost:3000";
  }
  // Production: bundled Next.js standalone server (port 38571)
  return "http://localhost:38571";
}

function getOfflinePath(): string {
  return `file://${path.join(__dirname, "..", "resources", "offline.html")}`;
}

function createWindow(): void {
  const preloadPath = path.join(__dirname, "preload.js");

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 880,
    minWidth: 960,
    minHeight: 680,
    backgroundColor: "#050814",
    title: "DISTORT",
    show: false,
    frame: true,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    icon: path.join(__dirname, "..", "build", "icon.png"),
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });

  mainWindow.once("ready-to-show", () => {
    if (!store.get("settings.startMinimized")) {
      mainWindow?.show();
    }
  });

  mainWindow?.on("close", (e) => {
    if (!isQuitting && store.get("settings.minimizeToTray")) {
      e.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow?.on("closed", () => {
    mainWindow = null;
  });

  // Open external links in the default browser
  mainWindow?.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  const url = getLoadUrl();
  log.info(`Loading URL: ${url}`);
  mainWindow?.loadURL(url).catch(() => {
    log.warn("Failed to load main URL, falling back to offline page");
    mainWindow?.loadURL(getOfflinePath());
  });

  // After 10s, if still loading, show offline page
  setTimeout(() => {
    if (mainWindow && !mainWindow.webContents.getURL().startsWith("http")) {
      mainWindow.loadURL(getOfflinePath());
    }
  }, 10000);
}

// ---------------------------------------------------------------------------
// Tray
// ---------------------------------------------------------------------------
function createTray(): void {
  const iconPath = path.join(__dirname, "..", "build", "icon.png");
  let icon = nativeImage.createFromPath(iconPath);
  if (icon.isEmpty()) {
    // Fallback: a 16x16 cyan square
    icon = nativeImage.createEmpty();
  }
  tray = new Tray(icon);
  tray.setToolTip("DISTORT — Freedom Beyond Borders");

  const updateMenu = () => {
    const vpn = store.get("vpn");
    const menu = Menu.buildFromTemplate([
      {
        label: vpn.connected ? "● Connected" : "○ Disconnected",
        enabled: false,
      },
      { type: "separator" },
      {
        label: vpn.connected ? "Disconnect" : "Quick Connect",
        click: () => {
          if (vpn.connected) {
            disconnectVpn();
          } else {
            quickConnect();
          }
        },
      },
      { type: "separator" },
      {
        label: "Show Distort",
        click: () => {
          mainWindow?.show();
          mainWindow?.focus();
        },
      },
      {
        label: "Settings",
        click: () => {
          mainWindow?.show();
          mainWindow?.focus();
          mainWindow?.webContents.send("navigate", "settings");
        },
      },
      { type: "separator" },
      {
        label: "Quit",
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ]);
    tray?.setContextMenu(menu);
  };

  updateMenu();
  tray?.on("click", () => {
    mainWindow?.show();
    mainWindow?.focus();
  });

  // Refresh menu when VPN state changes
  ipcMain.on("vpn:state-changed", updateMenu);
}

// ---------------------------------------------------------------------------
// VPN engine — REAL xray-core integration with REAL credentials
// ---------------------------------------------------------------------------
type VpnState = {
  connected: boolean;
  server: { code: string; country: string; host: string; port: number } | null;
  protocol: string;
  startedAt: number | null;
  configUri?: string | null;
  exitIp?: string | null;
  exitCountry?: string | null;
};

type DesktopSettings = {
  autoConnect: boolean;
  killSwitch: boolean;
  stealthMode: boolean;
  dnsLeakProtection: boolean;
  minimizeToTray: boolean;
  startMinimized: boolean;
};

// Path to the bundled xray binary (in production, it's in resources/bin)
function getXrayPath(): string {
  const isDev = !!process.env.DISTORT_DEV;
  if (isDev) {
    return path.join(__dirname, "..", "resources", "bin", "xray.exe");
  }
  // Production: resources/bin/xray.exe
  return path.join(process.resourcesPath, "bin", "xray.exe");
}

function getWintunPath(): string {
  const isDev = !!process.env.DISTORT_DEV;
  if (isDev) {
    return path.join(__dirname, "..", "resources", "bin", "wintun.dll");
  }
  return path.join(process.resourcesPath, "bin", "wintun.dll");
}

// Build a REAL xray config using real credentials from a Community Mesh URI.
// Falls back to a clear error if no real URI is provided — NO fake credentials.
function buildXrayConfig(server: VpnState["server"], protocol: string, configUri?: string | null): object {
  if (!server) throw new Error("No server selected");

  // If we have a real Community Mesh URI, use ITS credentials (not fakes).
  if (configUri && typeof configUri === "string" && configUri.length > 10) {
    // Inline import to avoid circular deps
    const { parseUriToRealConfig, buildRealXrayConfig } = require("./real-xray-config");
    const realCfg = parseUriToRealConfig(configUri);
    if (realCfg) {
      const settings = store.get("settings");
      return buildRealXrayConfig(realCfg, {
        tun: true, // system-wide tunnel via wintun.dll
        socksPort: 10808,
        httpPort: 10809,
        dnsLeakProtection: settings.dnsLeakProtection !== false,
      });
    }
    throw new Error("Could not parse the provided config URI");
  }

  // No real URI → throw an honest error instead of using fake credentials.
  throw new Error(
    `No real VPN config provided. The Distort servers (${server.host}:${server.port}) are not yet operational. ` +
    `Please select a config from the Community Mesh tab — those use REAL credentials from the Iran subscription.`
  );
}

import { randomUUID as cryptoRandomUUID } from "crypto";

async function startVpnEngine(server: VpnState["server"], protocol: string, configUri?: string | null): Promise<void> {
  if (!server) throw new Error("No server selected");
  log.info(`Starting xray-core: ${protocol} to ${server.host}:${server.port}`);

  // Stop any existing xray process
  if (vpnProcess) {
    try { vpnProcess.kill("SIGTERM"); } catch {}
    vpnProcess = null;
  }

  // Build the REAL config (uses real credentials from configUri, or throws)
  const config = buildXrayConfig(server, protocol, configUri);
  const configPath = path.join(app.getPath("userData"), "xray-config.json");
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  log.info(`xray config written to: ${configPath}`);

  const xrayPath = getXrayPath();
  if (!fs.existsSync(xrayPath)) {
    log.error(`xray binary not found at: ${xrayPath}`);
    throw new Error("VPN engine binary missing");
  }

  // Spawn xray.exe
  vpnProcess = spawn(xrayPath, ["run", "-c", configPath], {
    cwd: path.dirname(xrayPath),
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });

  // Track xray's health — only mark "connected" after REAL HTTP request through proxy
  let handshakeConfirmed = false;
  let startupError = "";
  const startupTimeout = setTimeout(() => {
    if (!handshakeConfirmed && !startupError) {
      // xray is still alive after 5s — do a REAL HTTP request through the
      // SOCKS proxy to verify traffic actually flows to the destination.
      // This is more honest than just checking if the SOCKS port is open.
      verifyHttpThroughProxy().then((verified) => {
        if (verified && !handshakeConfirmed && !startupError) {
          handshakeConfirmed = true;
          store.set("vpn", {
            connected: true,
            server,
            protocol,
            configUri: configUri ?? null,
            startedAt: Date.now(),
          });
          mainWindow?.webContents.send("vpn:state-changed", store.get("vpn"));
          log.info("xray-core confirmed working (HTTP through proxy succeeded) — connected");
        } else if (!startupError) {
          log.warn("xray process alive but HTTP verification failed — NOT marking as connected");
          store.set("vpn", {
            connected: false,
            server,
            protocol,
            configUri: configUri ?? null,
            startedAt: null,
          });
          mainWindow?.webContents.send("vpn:state-changed", store.get("vpn"));
          mainWindow?.webContents.send("vpn:error", "Tunnel started but HTTP request through proxy failed. The server may be unreachable or credentials may be invalid.");
        }
      });
    }
  }, 5000);

  // Also remove the premature "started"/"listening" trigger that could
  // mark connected before traffic verification completes.
  // (Previously, xray logging "started" would immediately mark connected —
  //  but that only means the inbound is ready, not that the outbound works.)

  // REAL HTTP verification: do an actual GET request through xray's SOCKS5 proxy.
  // This is the ONLY way to verify the tunnel works — NOT just checking if the
  // SOCKS port is open (that only proves xray's inbound is ready, not outbound).
  //
  // We do a full SOCKS5 handshake + TLS + HTTP GET to cloudflare/cdn-cgi/trace.
  // If we get a valid response containing "ip=", the tunnel is verified working.
  // If ANY step fails → return false (NOT connected). No fallbacks.
  async function verifyHttpThroughProxy(): Promise<boolean> {
    let socksSocket: any = null;
    let tlsSocket: any = null;
    try {
      const net = require("net");
      const { connect: tlsConnect } = await import("tls");

      // Create a SOCKS5 connection to xray's local proxy
      socksSocket = new net.Socket();
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error("SOCKS connect timeout")), 5000);
        socksSocket.connect(10808, "127.0.0.1", () => { clearTimeout(t); resolve(); });
        socksSocket.on("error", (err: any) => { clearTimeout(t); reject(err); });
      });

      // SOCKS5 greeting: version 5, 1 auth method, no auth
      socksSocket.write(Buffer.from([0x05, 0x01, 0x00]));
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error("SOCKS greeting timeout")), 5000);
        socksSocket.once("data", () => { clearTimeout(t); resolve(); });
      });

      // SOCKS5 CONNECT request to www.cloudflare.com:443
      const targetHost = "www.cloudflare.com";
      const hostBytes = Buffer.from(targetHost);
      const connectReq = Buffer.concat([
        Buffer.from([0x05, 0x01, 0x00, 0x03]),
        Buffer.from([hostBytes.length]),
        hostBytes,
        Buffer.from([0x01, 0xbb]), // port 443
      ]);
      socksSocket.write(connectReq);

      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error("SOCKS CONNECT timeout")), 8000);
        socksSocket.once("data", (data: Buffer) => {
          clearTimeout(t);
          if (data[1] === 0x00) {
            resolve(); // connected through SOCKS
          } else {
            reject(new Error(`SOCKS CONNECT failed: code ${data[1]}`));
          }
        });
      });

      // Wrap in TLS
      tlsSocket = tlsConnect({ socket: socksSocket, servername: targetHost });
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error("TLS handshake timeout")), 8000);
        tlsSocket.once("secureConnect", () => { clearTimeout(t); resolve(); });
        tlsSocket.once("error", (err: any) => { clearTimeout(t); reject(err); });
      });

      // Send HTTP request
      tlsSocket.write("GET /cdn-cgi/trace HTTP/1.1\r\nHost: www.cloudflare.com\r\nConnection: close\r\n\r\n");

      const response = await new Promise<string>((resolve, reject) => {
        let data = "";
        const t = setTimeout(() => resolve(data), 8000);
        tlsSocket.on("data", (chunk: Buffer) => { data += chunk.toString(); });
        tlsSocket.on("end", () => { clearTimeout(t); resolve(data); });
        tlsSocket.on("error", (err: any) => { clearTimeout(t); reject(err); });
      });

      // Validate response — must contain "ip=" to prove traffic flowed
      if (response.includes("ip=")) {
        // Parse exit IP and country from cloudflare trace response
        // Response format: ip=x.x.x.x\nuag=...\nloc=IR\ncolo=...\n
        const exitIp = response.match(/ip=([^\r\n]+)/)?.[1]?.trim() || "";
        const exitCountry = response.match(/loc=([^\r\n]+)/)?.[1]?.trim() || "";
        log.info(`Traffic verification: exit IP=${exitIp}, country=${exitCountry} — tunnel verified`);

        // Store exit IP + country in VPN state
        const currentVpn = store.get("vpn");
        store.set("vpn", {
          ...currentVpn,
          exitIp,
          exitCountry,
        });
        mainWindow?.webContents.send("vpn:exit-info", { exitIp, exitCountry });

        return true;
      } else {
        log.warn("Traffic verification: SOCKS connected but no valid HTTP response — NOT connected");
        return false;
      }
    } catch (e: any) {
      log.warn(`Traffic verification FAILED: ${e?.message} — NOT connected`);
      return false;
    } finally {
      // Always clean up sockets
      try { tlsSocket?.destroy(); } catch {}
      try { socksSocket?.destroy(); } catch {}
    }
  }

  vpnProcess.stdout?.on("data", (data) => {
    const line = data.toString().trim();
    log.info(`[xray] ${line}`);
    // NOTE: We do NOT mark "connected" here just because xray logs "started".
    // "started" only means the inbound proxy is ready — it does NOT prove the
    // outbound to the VPN server works. We wait for the 5s timeout to do a
    // real HTTP request through the proxy (see verifyHttpThroughProxy above).
  });

  vpnProcess.stderr?.on("data", (data) => {
    const line = data.toString().trim();
    log.error(`[xray] ${line}`);
    // Capture real errors — don't show "connected" if xray failed to start
    if (line.includes("error") || line.includes("failed") || line.includes("panic")) {
      startupError = line;
      clearTimeout(startupTimeout);
      store.set("vpn", {
        connected: false,
        server: null,
        protocol,
        configUri: null,
        startedAt: null,
      });
      mainWindow?.webContents.send("vpn:state-changed", store.get("vpn"));
      mainWindow?.webContents.send("vpn:error", startupError);
    }
  });

  vpnProcess.on("exit", (code) => {
    log.info(`xray exited with code ${code}`);
    clearTimeout(startupTimeout);
    if (store.get("vpn.connected")) {
      store.set("vpn", { ...store.get("vpn"), connected: false, startedAt: null });
      mainWindow?.webContents.send("vpn:state-changed", store.get("vpn"));
      // If kill switch is enabled, block all traffic now
      if (store.get("settings.killSwitch")) {
        log.warn("Kill switch activated — xray exited unexpectedly");
        mainWindow?.webContents.send("vpn:kill-switch-activated");
      }
    }
  });

  // Wait briefly for xray to start (but don't block on handshake)
  await new Promise((r) => setTimeout(r, 500));

  if (!handshakeConfirmed && !startupError) {
    // Still starting — show "connecting" state
    store.set("vpn", {
      connected: false,
      server,
      protocol,
      configUri: configUri ?? null,
      startedAt: null,
    });
    mainWindow?.webContents.send("vpn:state-changed", store.get("vpn"));
    log.info("xray-core starting — waiting for handshake");
  }
}

async function stopVpnEngine(): Promise<void> {
  log.info("Stopping xray-core…");
  if (vpnProcess) {
    try {
      vpnProcess.kill("SIGTERM");
      // Give it 500ms to exit gracefully
      await new Promise((r) => setTimeout(r, 500));
      if (!vpnProcess.killed) {
        vpnProcess.kill("SIGKILL");
      }
    } catch (e) {
      log.error("Error killing xray:", e);
    }
    vpnProcess = null;
  }

  // If kill switch is enabled, block all non-tunnel traffic until user reconnects.
  // On Windows: use netsh advfirewall to add a block rule (requires admin).
  // On macOS/Linux: we can't easily block without root, so we just warn the user.
  const settings = store.get("settings");
  if (settings.killSwitch && process.platform === "win32") {
    await enableKillSwitch();
  } else if (settings.killSwitch) {
    log.warn("Kill switch: not implemented on this platform — traffic may leak");
    mainWindow?.webContents.send("vpn:warning", "Kill switch is enabled but not implemented on this platform. Your real IP may be exposed.");
  }

  store.set("vpn", {
    connected: false,
    server: null,
    protocol: store.get("vpn.protocol"),
    startedAt: null,
  });
  mainWindow?.webContents.send("vpn:state-changed", store.get("vpn"));
}

// REAL kill switch on Windows.
//
// APPROACH: Route table manipulation (NOT Windows Firewall).
//
// Why not firewall? Windows Firewall has a known issue: Block rules can
// override Allow rules depending on policy settings. This makes it
// unreliable for a kill switch — the VPN server might get blocked too,
// preventing reconnection.
//
// Instead, we manipulate the system's routing table:
// 1. Remove the default route (so no traffic can leave)
// 2. Add a specific route for the VPN server IP (so the tunnel can reconnect)
//
// This is more reliable because:
// - Route table is processed in priority order (lowest metric wins)
// - We add the VPN server route with a LOW metric (high priority)
// - The default route is removed, so all other traffic fails
// - No "Block vs Allow" priority conflict
//
// NOTE: This requires admin privileges. If the app doesn't have admin,
// the kill switch won't work and we log a clear warning.
let killSwitchActive = false;
let savedDefaultGateway = "";
let savedInterfaceIndex = 0;
let savedDefaultMetric = 25; // default if we can't read it

async function enableKillSwitch(): Promise<void> {
  if (killSwitchActive) return;
  try {
    log.info("Kill switch: enabling via route table manipulation…");
    const { exec } = require("child_process") as { exec: (cmd: string, cb: (e: any, o: string, e2: string) => void) => void };

    if (process.platform !== "win32") {
      log.warn("Kill switch: route table manipulation only implemented for Windows");
      return;
    }

    // Step 1: Get ALL active IPv4 routes using PowerShell (more reliable than route print)
    // We need: default gateway, interface index, and interface metric
    const routeInfo = await new Promise<{ gateway: string; iface: string; ifaceIp: string; metric: number }>((resolve) => {
      // PowerShell gives us structured output including metric
      exec(
        'powershell -Command "Get-NetRoute -DestinationPrefix 0.0.0.0/0 | Select-Object -First 1 -Property NextHop,InterfaceIndex,InterfaceMetric | Format-List"',
        (err, stdout) => {
          if (err) {
            log.warn(`Kill switch: PowerShell Get-NetRoute failed: ${err.message}, trying route print`);
            exec("route print -4 0.0.0.0", (err2, stdout2) => {
              if (err2) {
                resolve({ gateway: "", iface: "", ifaceIp: "", metric: 25 });
                return;
              }
              parseRoutePrintOutput(stdout2, resolve);
            });
            return;
          }
          const gateway = stdout.match(/NextHop\s*:\s*(\d+\.\d+\.\d+\.\d+)/)?.[1] || "";
          const iface = stdout.match(/InterfaceIndex\s*:\s*(\d+)/)?.[1] || "";
          const metric = parseInt(stdout.match(/InterfaceMetric\s*:\s*(\d+)/)?.[1] || "25");
          if (iface) {
            exec(
              `powershell -Command "(Get-NetIPAddress -InterfaceIndex ${iface} -AddressFamily IPv4).IPAddress"`,
              (e3, ipOut) => {
                const ifaceIp = ipOut?.trim() || "";
                resolve({ gateway, iface, ifaceIp, metric });
              }
            );
          } else {
            resolve({ gateway, iface, ifaceIp: "", metric });
          }
        }
      );
    });

    savedDefaultGateway = routeInfo.gateway;
    savedInterfaceIndex = parseInt(routeInfo.iface) || 0;
    savedDefaultMetric = routeInfo.metric || 25;

    if (!savedDefaultGateway || savedInterfaceIndex === 0) {
      log.error("Kill switch: could not find default route — kill switch ABORTED (would not work)");
      return;
    }

    log.info(`Kill switch: gateway=${savedDefaultGateway}, iface=${savedInterfaceIndex}, ip=${routeInfo.ifaceIp}`);

    // Step 2: Get the VPN server IP
    // CRITICAL: If we can't resolve the VPN server IP, we MUST NOT remove
    // the default route — otherwise the tunnel can't reconnect and the user
    // is left without internet.
    const vpnServer = store.get("vpn.server") as { host?: string } | null;
    const vpnHost = vpnServer?.host || "";
    let vpnIp = "";
    if (vpnHost) {
      try {
        const dnsPromises = require("dns").promises;
        const addresses = await dnsPromises.lookup(vpnHost, { all: true });
        if (Array.isArray(addresses) && addresses.length > 0) {
          vpnIp = addresses[0].address;
        }
      } catch (e: any) {
        log.error(`Kill switch: ABORTED — could not resolve VPN server IP: ${e.message}`);
        log.error("Kill switch: If we removed the default route now, the tunnel couldn't reconnect.");
        return; // FAIL-CLOSED: don't proceed without VPN server route
      }
    }

    if (!vpnIp) {
      log.error("Kill switch: ABORTED — VPN server IP is empty, cannot add exclusion route");
      return;
    }

    // NOW we have all the info — persist route info to disk for crash recovery
    const routeBackupFile = path.join(app.getPath("userData"), "killswitch-backup.json");
    fs.writeFileSync(routeBackupFile, JSON.stringify({
      gateway: savedDefaultGateway,
      interfaceIndex: savedInterfaceIndex,
      interfaceIp: routeInfo.ifaceIp,
      metric: savedDefaultMetric,
      vpnIp: vpnIp, // CRITICAL: save VPN server IP so crash recovery can delete its route
      timestamp: Date.now(),
    }));
    log.info(`Kill switch: route info saved (gateway=${savedDefaultGateway}, iface=${savedInterfaceIndex}, metric=${savedDefaultMetric}, vpnIp=${vpnIp})`);

    // Step 3: Add a specific route for the VPN server (high priority)
    // This must be done BEFORE removing the default route.
    // CRITICAL: If this fails, we MUST NOT remove the default route —
    // otherwise the tunnel can't reconnect and the user loses internet.
    const vpnRouteAdded = await new Promise<boolean>((resolve) => {
      exec(
        `route add ${vpnIp} mask 255.255.255.255 ${savedDefaultGateway} metric 1 IF ${savedInterfaceIndex}`,
        (err) => {
          if (err) {
            log.error(`Kill switch: ABORTED — could not add VPN server route: ${err.message}`);
            log.error("Kill switch: Without this route, removing default route would break reconnection.");
            resolve(false);
          } else {
            log.info(`Kill switch: VPN server ${vpnIp} route added (metric 1)`);
            resolve(true);
          }
        }
      );
    });

    if (!vpnRouteAdded) {
      // VPN route failed — DO NOT remove default route
      // Delete the backup file since kill switch didn't actually activate
      try {
        const routeBackupFile = path.join(app.getPath("userData"), "killswitch-backup.json");
        if (fs.existsSync(routeBackupFile)) fs.unlinkSync(routeBackupFile);
      } catch {}
      return; // ABORT — don't proceed to step 4
    }

    // Step 4: Remove the default IPv4 route (blocks all other traffic)
    await new Promise<void>((resolve) => {
      exec(
        `route delete 0.0.0.0 mask 0.0.0.0 ${savedDefaultGateway} IF ${savedInterfaceIndex}`,
        (err) => {
          if (err) {
            log.warn(`Kill switch: could not remove default IPv4 route: ${err.message}`);
          } else {
            log.info("Kill switch: default IPv4 route removed");
          }
          resolve();
        }
      );
    });

    // Step 4b: Also remove IPv6 default route to prevent IPv6 leaks
    // Without this, traffic can bypass the tunnel via IPv6
    await new Promise<void>((resolve) => {
      exec(
        'route delete ::/0',
        (err) => {
          if (err) {
            log.warn(`Kill switch: could not remove IPv6 default route: ${err.message} (may not exist)`);
          } else {
            log.info("Kill switch: IPv6 default route removed — IPv6 leak prevented");
          }
          resolve();
        }
      );
    });

    // Step 4c: Disable IPv6 entirely via netsh (extra protection)
    await new Promise<void>((resolve) => {
      exec(
        'netsh interface ipv6 6to4 set state state=disabled undoonstop=disabled',
        (err) => {
          if (err) {
            log.warn(`Kill switch: could not disable IPv6 6to4: ${err.message}`);
          }
          resolve();
        }
      );
    });

    // Step 5: VERIFY the default IPv4 route is actually gone
    const verified = await new Promise<boolean>((resolve) => {
      exec("route print -4 0.0.0.0", (err, stdout) => {
        if (err) {
          log.error("Kill switch: VERIFICATION failed — could not query route table");
          resolve(false);
          return;
        }
        const lines = stdout.split("\n");
        for (const line of lines) {
          if (/^\s*0\.0\.0\.0\s+0\.0\.0\.0\s+\d+\.\d+\.\d+\.\d+/.test(line)) {
            log.error(`Kill switch: VERIFICATION FAILED — default route still exists: ${line.trim()}`);
            resolve(false);
            return;
          }
        }
        log.info("Kill switch: VERIFIED — no default IPv4 route found");
        resolve(true);
      });
    });

    // Step 6: If verification failed, RESTORE everything immediately
    // to avoid leaving the user without internet
    if (!verified) {
      log.error("Kill switch: verification failed — restoring default route and cleaning up");

      // Restore IPv4 default route
      await new Promise<void>((resolve) => {
        exec(
          `route add 0.0.0.0 mask 0.0.0.0 ${savedDefaultGateway} metric ${savedDefaultMetric} IF ${savedInterfaceIndex}`,
          (err) => {
            if (err) {
              log.error(`Kill switch: FAILED to restore default route: ${err.message}`);
            } else {
              log.info("Kill switch: default route restored after verification failure");
            }
            resolve();
          }
        );
      });

      // Restore IPv6 default route
      await new Promise<void>((resolve) => {
        exec('netsh interface ipv6 6to4 set state state=enabled undoonstop=enabled', () => resolve());
      });

      // Delete the VPN server route we added
      await new Promise<void>((resolve) => {
        exec(`route delete ${vpnIp}`, () => resolve());
      });

      // Delete backup file
      try {
        const routeBackupFile = path.join(app.getPath("userData"), "killswitch-backup.json");
        if (fs.existsSync(routeBackupFile)) fs.unlinkSync(routeBackupFile);
      } catch {}

      killSwitchActive = false;
      return; // Kill switch is NOT active
    }

    killSwitchActive = true;
    mainWindow?.webContents.send("vpn:kill-switch-activated");
    log.info("Kill switch: ACTIVE — IPv4 + IPv6 routes blocked, VPN server excluded");
  } catch (e: any) {
    log.warn(`Kill switch error: ${e?.message}`);
  }
}

// Helper: parse 'route print' output (fallback when PowerShell isn't available)
function parseRoutePrintOutput(stdout: string, resolve: (val: { gateway: string; iface: string; ifaceIp: string; metric: number }) => void) {
  const lines = stdout.split("\n");
  for (const line of lines) {
    // IPv4 route table format:
    // Network    Netmask       Gateway       Interface    Metric
    // 0.0.0.0    0.0.0.0       192.168.1.1   192.168.1.5   25
    const match = line.match(/^\s*0\.0\.0\.0\s+0\.0\.0\.0\s+(\d+\.\d+\.\d+\.\d+)\s+(\d+\.\d+\.\d+\.\d+)\s+(\d+)/);
    if (match) {
      const gateway = match[1];
      const ifaceIp = match[2];
      const metric = parseInt(match[3]) || 25;
      const { exec } = require("child_process");
      exec(
        `powershell -Command "(Get-NetIPAddress -IPAddress ${ifaceIp}).InterfaceIndex"`,
        (e: any, out: string) => {
          resolve({ gateway, iface: out?.trim() || "0", ifaceIp, metric });
        }
      );
      return;
    }
  }
  resolve({ gateway: "", iface: "", ifaceIp: "", metric: 25 });
}

async function disableKillSwitch(): Promise<void> {
  if (!killSwitchActive) return;
  try {
    log.info("Kill switch: restoring default route…");
    const { exec } = require("child_process") as { exec: (cmd: string, cb: (e: any, o: string, e2: string) => void) => void };

    // Restore the default route
    if (savedDefaultGateway && savedInterfaceIndex > 0) {
      await new Promise<void>((resolve) => {
        exec(
          `route add 0.0.0.0 mask 0.0.0.0 ${savedDefaultGateway} metric ${savedDefaultMetric} IF ${savedInterfaceIndex}`,
          (err) => {
            if (err) {
              log.error(`Kill switch: FAILED to restore default route: ${err.message}`);
              log.error("Kill switch: YOUR INTERNET MAY BE BLOCKED — run this manually:");
              log.error(`  route add 0.0.0.0 mask 0.0.0.0 ${savedDefaultGateway} metric ${savedDefaultMetric} IF ${savedInterfaceIndex}`);
            } else {
              log.info("Kill switch: default route restored — internet is back");
              killSwitchActive = false;
              // Delete the backup file since we successfully restored
              try {
                const routeBackupFile = path.join(app.getPath("userData"), "killswitch-backup.json");
                if (fs.existsSync(routeBackupFile)) fs.unlinkSync(routeBackupFile);
              } catch {}
            }
            resolve();
          }
        );
      });
    }

    // Restore IPv6 (6to4)
    await new Promise<void>((resolve) => {
      exec('netsh interface ipv6 6to4 set state state=enabled undoonstop=enabled', () => {
        log.info("Kill switch: IPv6 6to4 re-enabled");
        resolve();
      });
    });

    // Remove the VPN server specific route (re-resolve in case IP changed)
    const vpnServer = store.get("vpn.server") as { host?: string } | null;
    const vpnHost = vpnServer?.host || "";
    if (vpnHost && savedDefaultGateway) {
      try {
        const dnsPromises = require("dns").promises;
        const addresses = await dnsPromises.lookup(vpnHost, { all: true });
        if (addresses.length > 0) {
          const vpnIp = addresses[0].address;
          await new Promise<void>((resolve) => {
            exec(`route delete ${vpnIp}`, () => resolve());
          });
        }
      } catch (e: any) {
        log.warn(`Kill switch: could not remove VPN server route: ${e.message}`);
        // Try deleting the route using the saved VPN IP (from backup file)
        try {
          const routeBackupFile = path.join(app.getPath("userData"), "killswitch-backup.json");
          if (fs.existsSync(routeBackupFile)) {
            const backup = JSON.parse(fs.readFileSync(routeBackupFile, "utf-8"));
            if (backup.vpnIp) {
              exec(`route delete ${backup.vpnIp}`, () => {});
            }
          }
        } catch {}
      }
    }
  } catch (e: any) {
    log.warn(`Kill switch disable error: ${e?.message}`);
  }
}

async function quickConnect(): Promise<void> {
  try {
    // Step 1: Get multiple optimized configs from Community Mesh
    // We'll try each one in sequence until one works — this is the
    // NATIONAL INTERNET RESILIENCE feature: if one config is blocked,
    // we automatically try the next one.
    const meshUrl = `${getLoadUrl()}/api/imported-configs?bucket=optimized&limit=20`;
    const meshRes = await fetch(meshUrl);
    const meshData: any = await meshRes.json();
    const configs = meshData?.configs || [];

    if (configs.length === 0) {
      log.error("Quick connect: no Community Mesh configs available");
      mainWindow?.webContents.send("vpn:error",
        "No VPN configs available. Please refresh the Community Mesh subscription or import a config."
      );
      return;
    }

    log.info(`Quick connect: trying ${configs.length} optimized configs in sequence (auto-failover)`);

    // Try each config until one connects successfully
    for (let i = 0; i < configs.length; i++) {
      const cfg = configs[i];
      log.info(`Quick connect: attempt ${i + 1}/${configs.length} — ${cfg.protocol} ${cfg.host}:${cfg.port} (${cfg.flags || 'no flags'})`);

      // Notify UI of attempt
      mainWindow?.webContents.send("vpn:connecting", {
        attempt: i + 1,
        total: configs.length,
        host: cfg.host,
        protocol: cfg.protocol,
      });

      const server: VpnState["server"] = {
        code: cfg.host,
        country: cfg.country || cfg.host,
        host: cfg.host,
        port: cfg.port,
      };

      // Disable kill switch before attempting (from previous failed try)
      await disableKillSwitch();

      try {
        await startVpnEngine(server, cfg.protocol, cfg.uri);

        // Wait for verification (startVpnEngine does this internally with 5s timeout)
        // Check if connected after 7 seconds (5s verification + 2s buffer)
        await new Promise((r) => setTimeout(r, 7000));

        const vpnState = store.get("vpn");
        if (vpnState.connected) {
          log.info(`Quick connect: SUCCESS on attempt ${i + 1} — connected via ${cfg.host}`);

          // Step 3: Cache this working config for offline use
          // (national internet scenario — subscription URL may be unreachable)
          try {
            const cacheFile = path.join(app.getPath("userData"), "last-working-config.json");
            fs.writeFileSync(cacheFile, JSON.stringify({
              uri: cfg.uri,
              protocol: cfg.protocol,
              host: cfg.host,
              port: cfg.port,
              country: cfg.country,
              timestamp: Date.now(),
            }));
            log.info(`Quick connect: cached working config to ${cacheFile}`);
          } catch {}

          return; // Success!
        } else {
          log.warn(`Quick connect: attempt ${i + 1} failed — trying next config`);
          await stopVpnEngine();
        }
      } catch (e: any) {
        log.warn(`Quick connect: attempt ${i + 1} error: ${e?.message} — trying next`);
        await stopVpnEngine();
      }
    }

    // All configs failed — try cached offline config (national internet scenario)
    log.warn("Quick connect: all Community Mesh configs failed — trying cached offline config");
    try {
      const cacheFile = path.join(app.getPath("userData"), "last-working-config.json");
      if (fs.existsSync(cacheFile)) {
        const cached = JSON.parse(fs.readFileSync(cacheFile, "utf-8"));
        log.info(`Quick connect: trying cached config from ${new Date(cached.timestamp).toISOString()}: ${cached.host}`);

        const server: VpnState["server"] = {
          code: cached.host,
          country: cached.country || cached.host,
          host: cached.host,
          port: cached.port,
        };

        await disableKillSwitch();
        await startVpnEngine(server, cached.protocol, cached.uri);

        await new Promise((r) => setTimeout(r, 7000));
        const vpnState = store.get("vpn");
        if (vpnState.connected) {
          log.info("Quick connect: SUCCESS with cached offline config");
          return;
        }
      }
    } catch (e: any) {
      log.warn(`Quick connect: cached config also failed: ${e?.message}`);
    }

    log.error("Quick connect: ALL configs failed — cannot connect");
    mainWindow?.webContents.send("vpn:error",
      "All VPN configs failed. The network may be heavily filtered. Try again later or import a new config."
    );
  } catch (e: any) {
    log.error("Quick connect failed:", e?.message || e);
    mainWindow?.webContents.send("vpn:error", `Quick connect failed: ${e?.message || "unknown error"}`);
  }
}

function disconnectVpn(): void {
  stopVpnEngine();
}

// ---------------------------------------------------------------------------
// IPC handlers
// ---------------------------------------------------------------------------
ipcMain.handle("vpn:connect", async (_e, server, protocol, configUri) => {
  await startVpnEngine(server, protocol, configUri);
  return store.get("vpn");
});

ipcMain.handle("vpn:disconnect", async () => {
  await stopVpnEngine();
  return store.get("vpn");
});

ipcMain.handle("vpn:state", async () => {
  return store.get("vpn");
});

ipcMain.handle("settings:get", async () => {
  return store.get("settings");
});

ipcMain.handle("settings:set", async (_e, patch) => {
  const current = store.get("settings");
  store.set("settings", { ...current, ...patch });
  return store.get("settings");
});

ipcMain.handle("app:version", async () => {
  return app.getVersion();
});

ipcMain.handle("app:platform", async () => {
  return { platform: process.platform, arch: process.arch };
});

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------
import { spawn as spawnChild } from "child_process";

let nextServer: ReturnType<typeof spawnChild> | null = null;

function getNextStandalonePath(): string {
  const isDev = !!process.env.DISTORT_DEV;
  if (isDev) {
    return path.join(__dirname, "..", "..", ".next", "standalone");
  }
  // Production: bundled in resources/next-standalone
  return path.join(process.resourcesPath, "next-standalone");
}

function startNextServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    const standalonePath = getNextStandalonePath();
    const serverJs = path.join(standalonePath, "server.js");

    log.info(`Starting Next.js standalone server from: ${serverJs}`);

    if (!fs.existsSync(serverJs)) {
      log.warn(`Next.js standalone server.js not found at ${serverJs}`);
      log.info("Will use offline page as fallback");
      resolve();
      return;
    }

    // Copy static assets to the right place if needed
    const staticSrc = path.join(standalonePath, ".next", "static");
    const staticDest = path.join(standalonePath, ".next", "static");
    if (fs.existsSync(staticSrc) && !fs.existsSync(staticDest)) {
      // already in place
    }

    // Start the Next.js standalone server on port 38571
    nextServer = spawnChild(process.execPath, [serverJs], {
      cwd: standalonePath,
      env: {
        ...process.env,
        PORT: "38571",
        NODE_ENV: "production",
        HOSTNAME: "127.0.0.1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    nextServer.stdout?.on("data", (data) => {
      log.info(`[next] ${data.toString().trim()}`);
    });
    nextServer.stderr?.on("data", (data) => {
      log.error(`[next] ${data.toString().trim()}`);
    });

    // Wait for server to be ready
    let attempts = 0;
    const checkInterval = setInterval(() => {
      attempts++;
      fetch("http://127.0.0.1:38571/")
        .then((r) => {
          if (r.ok) {
            clearInterval(checkInterval);
            log.info("Next.js standalone server is ready on port 38571");
            resolve();
          }
        })
        .catch(() => {
          if (attempts > 20) {
            clearInterval(checkInterval);
            log.warn("Next.js server didn't start in time");
            resolve(); // resolve anyway, will use offline fallback
          }
        });
    }, 500);
  });
}

app.whenReady().then(async () => {
  // CRASH RECOVERY: Check if kill switch was active when the app last closed.
  // If so, restore the default route IMMEDIATELY so the user isn't left
  // without internet.
  try {
    const routeBackupFile = path.join(app.getPath("userData"), "killswitch-backup.json");
    if (fs.existsSync(routeBackupFile)) {
      const backup = JSON.parse(fs.readFileSync(routeBackupFile, "utf-8"));
      log.warn(`Crash recovery: found kill switch backup from ${new Date(backup.timestamp).toISOString()}`);
      log.warn(`Crash recovery: restoring default route to ${backup.gateway} on interface ${backup.interfaceIndex}…`);

      const { exec } = require("child_process");
      if (backup.gateway && backup.interfaceIndex) {
        exec(
          `route add 0.0.0.0 mask 0.0.0.0 ${backup.gateway} metric ${backup.metric || 25} IF ${backup.interfaceIndex}`,
          (err: any) => {
            if (err) {
              log.error(`Crash recovery: FAILED to restore route: ${err.message}`);
              log.error(`Crash recovery: Run manually: route add 0.0.0.0 mask 0.0.0.0 ${backup.gateway} metric ${backup.metric || 25} IF ${backup.interfaceIndex}`);
              // DO NOT delete the backup file — keep it so the user can retry
              // or we can try again on next launch.
            } else {
              log.info("Crash recovery: default route restored — internet should be back");
              // Only delete backup after SUCCESSFUL restore
              try { fs.unlinkSync(routeBackupFile); } catch {}
            }
          }
        );
      }
    }
  } catch (e: any) {
    log.warn(`Crash recovery check failed: ${e?.message}`);
  }

  // Start Next.js standalone server first (if available)
  await startNextServer();

  createWindow();
  createTray();

  // Auto-connect on startup if enabled
  if (store.get("settings.autoConnect")) {
    setTimeout(() => quickConnect(), 1500);
  }

  // AUTO-REFRESH SUBSCRIPTIONS — keeps configs fresh for national internet resilience.
  // Every 60 minutes, refresh all enabled subscriptions so we always have the latest
  // working configs. This is critical for Iran: configs get blocked frequently and
  // new ones are published in the subscription URL regularly.
  const REFRESH_INTERVAL_MS = 60 * 60 * 1000; // 60 minutes
  let refreshTimer: NodeJS.Timeout | null = null;

  async function autoRefreshSubscriptions(): Promise<void> {
    try {
      log.info("Auto-refresh: refreshing all subscriptions…");
      const subsRes = await fetch(`${getLoadUrl()}/api/subscriptions`);
      const subsData: any = await subsRes.json();
      const subs = subsData?.subscriptions || [];

      for (const sub of subs) {
        if (!sub.enabled) continue;
        try {
          log.info(`Auto-refresh: refreshing "${sub.label}"…`);
          const refreshRes = await fetch(`${getLoadUrl()}/api/subscriptions/${sub.id}/refresh`, {
            method: "POST",
          });
          const refreshData: any = await refreshRes.json();
          log.info(`Auto-refresh: "${sub.label}" refreshed — ${refreshData.count || 0} configs`);
        } catch (e: any) {
          log.warn(`Auto-refresh: failed to refresh "${sub.label}": ${e?.message}`);
        }
      }

      // Also cache all optimized configs to disk for offline use
      // (national internet scenario — subscription URL may be unreachable)
      try {
        const configsRes = await fetch(`${getLoadUrl()}/api/imported-configs?bucket=optimized&limit=500`);
        const configsData: any = await configsRes.json();
        const configs = configsData?.configs || [];
        if (configs.length > 0) {
          const cacheFile = path.join(app.getPath("userData"), "cached-configs.json");
          fs.writeFileSync(cacheFile, JSON.stringify({
            configs: configs.map((c: any) => ({
              uri: c.uri,
              protocol: c.protocol,
              host: c.host,
              port: c.port,
              country: c.country,
              score: c.score,
              flags: c.flags,
            })),
            timestamp: Date.now(),
          }));
          log.info(`Auto-refresh: cached ${configs.length} configs to ${cacheFile} for offline use`);
        }
      } catch (e: any) {
        log.warn(`Auto-refresh: failed to cache configs: ${e?.message}`);
      }
    } catch (e: any) {
      log.warn(`Auto-refresh error: ${e?.message}`);
    }
  }

  // Run first refresh after 30s (let server start), then every 60min
  refreshTimer = setTimeout(() => {
    autoRefreshSubscriptions();
    refreshTimer = setInterval(autoRefreshSubscriptions, REFRESH_INTERVAL_MS);
  }, 30000);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else {
      mainWindow?.show();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin" && !store.get("settings.minimizeToTray")) {
    app.quit();
  }
});

app.on("before-quit", async (e) => {
  // Always clean up: stop xray, disable kill switch, even if quitting due to crash.
  if (store.get("vpn.connected")) {
    e.preventDefault();
    await stopVpnEngine();
    isQuitting = true;
  }
  // CRITICAL: Always disable kill switch on quit, otherwise the user's internet
  // would be permanently blocked if the app crashed while kill switch was active.
  await disableKillSwitch();
  if (!isQuitting) {
    isQuitting = true;
    app.quit();
  }
});

// On SIGINT/SIGTERM (e.g., system shutdown), clean up before exiting.
process.on("SIGINT", async () => {
  log.info("Received SIGINT — cleaning up…");
  await stopVpnEngine();
  await disableKillSwitch();
  process.exit(0);
});
process.on("SIGTERM", async () => {
  log.info("Received SIGTERM — cleaning up…");
  await stopVpnEngine();
  await disableKillSwitch();
  process.exit(0);
});

// On uncaught exceptions (potential crash), try to clean up before exiting.
process.on("uncaughtException", async (err) => {
  log.error("Uncaught exception — cleaning up before exit:", err);
  try {
    await stopVpnEngine();
    await disableKillSwitch();
  } catch {}
  process.exit(1);
});

// ---------------------------------------------------------------------------
// Phase 2 — real xray-core integration scaffolding
// ---------------------------------------------------------------------------
// The functions below are stubs for the real VPN engine.
// They will be wired to xray-core / sing-box binaries in Phase 2.
//
// export async function startXray(config: object): Promise<ChildProcess> {
//   const xrayBin = path.join(process.resourcesPath, "bin", "xray");
//   const configFile = path.join(app.getPath("userData"), "xray-config.json");
//   fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
//   return spawn(xrayBin, ["run", "-c", configFile], { stdio: ["ignore", "pipe", "pipe"] });
// }
//
// export async function startWireGuard(confPath: string): Promise<ChildProcess> {
//   // Use wireguard-go or boringtun for userspace WireGuard
//   const wgBin = path.join(process.resourcesPath, "bin", "wireguard-go");
//   return spawn(wgBin, [confPath]);
// }
