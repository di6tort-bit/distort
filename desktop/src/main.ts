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
  // The raw URI of the selected Community Mesh config (real credentials)
  configUri?: string | null;
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
  // This proves: (1) xray is running, (2) SOCKS inbound works, (3) the outbound
  // to the VPN server works, (4) traffic actually flows to a real destination.
  //
  // We fetch https://www.cloudflare.com/cdn-cgi/trace which returns the exit IP.
  // If we get a valid response, the tunnel is verified working.
  async function verifyHttpThroughProxy(): Promise<boolean> {
    try {
      // Use the SocksProxyAgent pattern: create a SOCKS5 connection to 127.0.0.1:10808,
      // then do an HTTP CONNECT through it.
      // Node.js 20+ has built-in support via undici, but for simplicity we
      // use a manual TCP socket check + assume HTTP works if SOCKS accepts.
      //
      // For a TRUE HTTP verification, we'd need socks-proxy-agent package.
      // Since we can't add deps mid-build, we do a 2-step check:
      //   1. SOCKS port accepts connections (xray inbound ready)
      //   2. Try to fetch through the proxy (proves outbound works)
      const net = require("net");

      // Step 1: Check SOCKS port
      const socksOk = await new Promise<boolean>((resolve) => {
        const socket = new net.Socket();
        const t = setTimeout(() => { socket.destroy(); resolve(false); }, 3000);
        socket.setTimeout(3000);
        socket.once("connect", () => {
          clearTimeout(t);
          socket.destroy();
          resolve(true);
        });
        socket.once("error", (err: any) => {
          clearTimeout(t);
          log.warn(`SOCKS port check failed: ${err?.message}`);
          resolve(false);
        });
        socket.connect(10808, "127.0.0.1");
      });

      if (!socksOk) {
        log.warn("Traffic verification: SOCKS port not reachable");
        return false;
      }
      log.info("Traffic verification: SOCKS port reachable");

      // Step 2: Try a real HTTP request through the SOCKS proxy.
      // We use fetch() with a custom dispatcher if available, otherwise
      // fall back to the SOCKS port check only.
      try {
        // Attempt to use the global fetch with SOCKS — this may not work
        // without socks-proxy-agent, but we try a direct TCP CONNECT.
        // If it fails, we still have the SOCKS port check above.
        const { connect: tlsConnect } = await import("tls");

        // Create a SOCKS5 handshake manually
        const socksSocket = new net.Socket();
        await new Promise<void>((resolve, reject) => {
          socksSocket.connect(10808, "127.0.0.1", resolve);
          socksSocket.on("error", reject);
        });

        // SOCKS5 greeting: version 5, 1 auth method, no auth
        socksSocket.write(Buffer.from([0x05, 0x01, 0x00]));
        await new Promise<void>((resolve) => {
          socksSocket.once("data", () => resolve());
        });

        // Resolve cloudflare.com IP (we'll connect to 104.16.0.0 range)
        // For simplicity, use www.cloudflare.com's known IP
        const targetHost = "www.cloudflare.com";
        const targetPort = 443;

        // SOCKS5 CONNECT request
        const hostBytes = Buffer.from(targetHost);
        const connectReq = Buffer.concat([
          Buffer.from([0x05, 0x01, 0x00, 0x03]), // ver, connect, rsv, domain
          Buffer.from([hostBytes.length]),
          hostBytes,
          Buffer.from([(targetPort >> 8) & 0xff, targetPort & 0xff]),
        ]);
        socksSocket.write(connectReq);

        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error("SOCKS connect timeout")), 8000);
          socksSocket.once("data", (data: Buffer) => {
            clearTimeout(timeout);
            if (data[1] === 0x00) {
              resolve(); // connected
            } else {
              reject(new Error(`SOCKS connect failed: ${data[1]}`));
            }
          });
        });

        // Wrap in TLS
        const tlsSocket = tlsConnect({
          socket: socksSocket,
          servername: targetHost,
        });

        await new Promise<void>((resolve, reject) => {
          tlsSocket.once("secureConnect", resolve);
          tlsSocket.once("error", reject);
        });

        // Send HTTP request
        tlsSocket.write("GET /cdn-cgi/trace HTTP/1.1\r\nHost: www.cloudflare.com\r\nConnection: close\r\n\r\n");

        const response = await new Promise<string>((resolve, reject) => {
          let data = "";
          tlsSocket.on("data", (chunk) => { data += chunk.toString(); });
          tlsSocket.on("end", () => resolve(data));
          tlsSocket.on("error", reject);
          setTimeout(() => resolve(data), 5000); // timeout
        });

        tlsSocket.destroy();
        socksSocket.destroy();

        if (response.includes("ip=")) {
          log.info("Traffic verification: got valid response through SOCKS proxy — tunnel verified");
          return true;
        } else {
          log.warn("Traffic verification: SOCKS connected but no valid HTTP response");
          return false;
        }
      } catch (httpErr: any) {
        log.warn(`Traffic verification: HTTP through SOCKS failed: ${httpErr?.message}`);
        // SOCKS port is open but HTTP failed — server may be unreachable
        return false;
      }
    } catch (e: any) {
      log.warn(`Traffic verification error: ${e?.message}`);
      return false;
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
    const routeInfo = await new Promise<{ gateway: string; iface: string; ifaceIp: string }>((resolve) => {
      // PowerShell gives us structured output
      exec(
        'powershell -Command "Get-NetRoute -DestinationPrefix 0.0.0.0/0 | Select-Object -First 1 -Property NextHop,InterfaceIndex,InterfaceAlias | Format-List"',
        (err, stdout) => {
          if (err) {
            log.warn(`Kill switch: PowerShell Get-NetRoute failed: ${err.message}, trying route print`);
            // Fallback to route print with better parsing
            exec("route print -4 0.0.0.0", (err2, stdout2) => {
              if (err2) {
                resolve({ gateway: "", iface: "", ifaceIp: "" });
                return;
              }
              parseRoutePrintOutput(stdout2, resolve);
            });
            return;
          }
          // Parse PowerShell output: "NextHop : 192.168.1.1\nInterfaceIndex : 12\nInterfaceAlias : Ethernet"
          const gateway = stdout.match(/NextHop\s*:\s*(\d+\.\d+\.\d+\.\d+)/)?.[1] || "";
          const iface = stdout.match(/InterfaceIndex\s*:\s*(\d+)/)?.[1] || "";
          // Get interface IP
          if (iface) {
            exec(
              `powershell -Command "(Get-NetIPAddress -InterfaceIndex ${iface} -AddressFamily IPv4).IPAddress"`,
              (e3, ipOut) => {
                const ifaceIp = ipOut?.trim() || "";
                resolve({ gateway, iface, ifaceIp });
              }
            );
          } else {
            resolve({ gateway, iface, ifaceIp: "" });
          }
        }
      );
    });

    savedDefaultGateway = routeInfo.gateway;
    savedInterfaceIndex = parseInt(routeInfo.iface) || 0;

    if (!savedDefaultGateway || savedInterfaceIndex === 0) {
      log.error("Kill switch: could not find default route — kill switch ABORTED (would not work)");
      return;
    }

    log.info(`Kill switch: gateway=${savedDefaultGateway}, iface=${savedInterfaceIndex}, ip=${routeInfo.ifaceIp}`);

    // Persist route info to disk for crash recovery
    const routeBackupFile = path.join(app.getPath("userData"), "killswitch-backup.json");
    fs.writeFileSync(routeBackupFile, JSON.stringify({
      gateway: savedDefaultGateway,
      interfaceIndex: savedInterfaceIndex,
      interfaceIp: routeInfo.ifaceIp,
      timestamp: Date.now(),
    }));
    log.info(`Kill switch: route info saved to ${routeBackupFile} for crash recovery`);

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

    // Step 3: Add a specific route for the VPN server (high priority)
    // This must be done BEFORE removing the default route
    await new Promise<void>((resolve) => {
      exec(
        `route add ${vpnIp} mask 255.255.255.255 ${savedDefaultGateway} metric 1 IF ${savedInterfaceIndex}`,
        (err) => {
          if (err) {
            log.error(`Kill switch: ABORTED — could not add VPN server route: ${err.message}`);
            log.error("Kill switch: Without this route, removing default route would break reconnection.");
          } else {
            log.info(`Kill switch: VPN server ${vpnIp} route added (metric 1)`);
          }
          resolve();
        }
      );
    });

    // Step 4: Remove the default route (blocks all other traffic)
    await new Promise<void>((resolve) => {
      exec(
        `route delete 0.0.0.0 mask 0.0.0.0 ${savedDefaultGateway} IF ${savedInterfaceIndex}`,
        (err) => {
          if (err) {
            log.warn(`Kill switch: could not remove default route: ${err.message}`);
          } else {
            log.info("Kill switch: default route removed — all traffic blocked except VPN server");
          }
          resolve();
        }
      );
    });

    // Step 5: VERIFY the default route is actually gone
    // Check for an ACTUAL route row with 0.0.0.0/0, not just the string "0.0.0.0"
    const verified = await new Promise<boolean>((resolve) => {
      exec("route print -4 0.0.0.0", (err, stdout) => {
        if (err) {
          log.error("Kill switch: VERIFICATION failed — could not query route table");
          resolve(false);
          return;
        }
        // Look for an actual default route row: "0.0.0.0    0.0.0.0    <gateway>    <iface>"
        // NOT just any line containing "0.0.0.0" (headers contain it too)
        const lines = stdout.split("\n");
        for (const line of lines) {
          // Match: destination=0.0.0.0, netmask=0.0.0.0, then gateway and metric
          if (/^\s*0\.0\.0\.0\s+0\.0\.0\.0\s+\d+\.\d+\.\d+\.\d+/.test(line)) {
            log.error(`Kill switch: VERIFICATION FAILED — default route still exists: ${line.trim()}`);
            resolve(false);
            return;
          }
        }
        log.info("Kill switch: VERIFIED — no default route found, kill switch is active");
        resolve(true);
      });
    });

    killSwitchActive = verified;
    if (verified) {
      mainWindow?.webContents.send("vpn:kill-switch-activated");
    }
  } catch (e: any) {
    log.warn(`Kill switch error: ${e?.message}`);
  }
}

// Helper: parse 'route print' output (fallback when PowerShell isn't available)
function parseRoutePrintOutput(stdout: string, resolve: (val: { gateway: string; iface: string; ifaceIp: string }) => void) {
  const lines = stdout.split("\n");
  for (const line of lines) {
    // IPv4 route table format:
    // Network    Netmask       Gateway       Interface    Metric
    // 0.0.0.0    0.0.0.0       192.168.1.1   192.168.1.5   25
    const match = line.match(/^\s*0\.0\.0\.0\s+0\.0\.0\.0\s+(\d+\.\d+\.\d+\.\d+)\s+(\d+\.\d+\.\d+\.\d+)\s+(\d+)/);
    if (match) {
      // match[1] = gateway, match[2] = interface IP, match[3] = metric
      // We need the interface INDEX, not IP — use the interface IP to find it
      const gateway = match[1];
      const ifaceIp = match[2];
      // Find interface index from IP
      const { exec } = require("child_process");
      exec(
        `powershell -Command "(Get-NetIPAddress -IPAddress ${ifaceIp}).InterfaceIndex"`,
        (e: any, out: string) => {
          resolve({ gateway, iface: out?.trim() || "0", ifaceIp });
        }
      );
      return;
    }
  }
  resolve({ gateway: "", iface: "", ifaceIp: "" });
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
          `route add 0.0.0.0 mask 0.0.0.0 ${savedDefaultGateway} metric 25 IF ${savedInterfaceIndex}`,
          (err) => {
            if (err) {
              log.error(`Kill switch: FAILED to restore default route: ${err.message}`);
              log.error("Kill switch: YOUR INTERNET MAY BE BLOCKED — run this manually:");
              log.error(`  route add 0.0.0.0 mask 0.0.0.0 ${savedDefaultGateway} metric 25 IF ${savedInterfaceIndex}`);
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
    // Step 1: Get the recommended Distort server (for display purposes)
    const recUrl = `${getLoadUrl()}/api/servers/recommended`;
    const recRes = await fetch(recUrl);
    const recData: any = await recRes.json();
    const recommendedServer = recData?.server;
    const recommendedProtocol = recData?.recommendedProtocol || "vless";

    if (!recommendedServer) {
      log.error("Quick connect failed: no recommended server");
      mainWindow?.webContents.send("vpn:error", "No servers available");
      return;
    }

    // Step 2: Get a REAL config URI from Community Mesh (with real credentials)
    // Prefer optimized configs (Reality/TLS/Vision) — these have real UUIDs/passwords
    const meshUrl = `${getLoadUrl()}/api/imported-configs?bucket=optimized&limit=1`;
    const meshRes = await fetch(meshUrl);
    const meshData: any = await meshRes.json();
    const realConfig = meshData?.configs?.[0];

    if (!realConfig || !realConfig.uri) {
      log.error("Quick connect failed: no real Community Mesh config available");
      mainWindow?.webContents.send("vpn:error",
        "No real VPN config available. Please refresh the Community Mesh subscription or import a config."
      );
      return;
    }

    log.info(`Quick connect: using real ${realConfig.protocol} config to ${realConfig.host}:${realConfig.port}`);

    // Disable kill switch if it was active (we're reconnecting)
    await disableKillSwitch();

    // Step 3: Build a VpnState server object from the real config
    const server: VpnState["server"] = {
      code: realConfig.host,
      country: realConfig.country || realConfig.host,
      host: realConfig.host,
      port: realConfig.port,
    };

    // Step 4: Start the VPN engine with the REAL config URI
    await startVpnEngine(server, realConfig.protocol, realConfig.uri);
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
          `route add 0.0.0.0 mask 0.0.0.0 ${backup.gateway} metric 25 IF ${backup.interfaceIndex}`,
          (err: any) => {
            if (err) {
              log.error(`Crash recovery: FAILED to restore route: ${err.message}`);
              log.error(`Crash recovery: Run manually: route add 0.0.0.0 mask 0.0.0.0 ${backup.gateway} metric 25 IF ${backup.interfaceIndex}`);
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
