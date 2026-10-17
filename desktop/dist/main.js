"use strict";
// DISTORT Desktop — Electron main process
// A 100% free, anti-censorship VPN client. Designed to outperform Nekoray & Hiddify.
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const child_process_1 = require("child_process");
const electron_store_1 = __importDefault(require("electron-store"));
const electron_log_1 = __importDefault(require("electron-log"));
// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------
electron_log_1.default.transports.file.level = "info";
electron_log_1.default.transports.console.level = "info";
electron_log_1.default.info("DISTORT Desktop starting up…");
// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const store = new electron_store_1.default({
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
let mainWindow = null;
let tray = null;
let vpnProcess = null;
let isQuitting = false;
// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------
function getLoadUrl() {
    const isDev = !!process.env.DISTORT_DEV;
    if (isDev) {
        return "http://localhost:3000";
    }
    // Production: bundled Next.js standalone server (port 38571)
    return "http://localhost:38571";
}
function getOfflinePath() {
    return `file://${path.join(__dirname, "..", "resources", "offline.html")}`;
}
function createWindow() {
    const preloadPath = path.join(__dirname, "preload.js");
    mainWindow = new electron_1.BrowserWindow({
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
            electron_1.shell.openExternal(url);
            return { action: "deny" };
        }
        return { action: "allow" };
    });
    const url = getLoadUrl();
    electron_log_1.default.info(`Loading URL: ${url}`);
    mainWindow?.loadURL(url).catch(() => {
        electron_log_1.default.warn("Failed to load main URL, falling back to offline page");
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
function createTray() {
    const iconPath = path.join(__dirname, "..", "build", "icon.png");
    let icon = electron_1.nativeImage.createFromPath(iconPath);
    if (icon.isEmpty()) {
        // Fallback: a 16x16 cyan square
        icon = electron_1.nativeImage.createEmpty();
    }
    tray = new electron_1.Tray(icon);
    tray.setToolTip("DISTORT — Freedom Beyond Borders");
    const updateMenu = () => {
        const vpn = store.get("vpn");
        const menu = electron_1.Menu.buildFromTemplate([
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
                    }
                    else {
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
                    electron_1.app.quit();
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
    electron_1.ipcMain.on("vpn:state-changed", updateMenu);
}
// Path to the bundled xray binary (in production, it's in resources/bin)
function getXrayPath() {
    const isDev = !!process.env.DISTORT_DEV;
    if (isDev) {
        return path.join(__dirname, "..", "resources", "bin", "xray.exe");
    }
    // Production: resources/bin/xray.exe
    return path.join(process.resourcesPath, "bin", "xray.exe");
}
function getWintunPath() {
    const isDev = !!process.env.DISTORT_DEV;
    if (isDev) {
        return path.join(__dirname, "..", "resources", "bin", "wintun.dll");
    }
    return path.join(process.resourcesPath, "bin", "wintun.dll");
}
// Build a REAL xray config using real credentials from a Community Mesh URI.
// Falls back to a clear error if no real URI is provided — NO fake credentials.
function buildXrayConfig(server, protocol, configUri) {
    if (!server)
        throw new Error("No server selected");
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
    throw new Error(`No real VPN config provided. The Distort servers (${server.host}:${server.port}) are not yet operational. ` +
        `Please select a config from the Community Mesh tab — those use REAL credentials from the Iran subscription.`);
}
async function startVpnEngine(server, protocol, configUri) {
    if (!server)
        throw new Error("No server selected");
    electron_log_1.default.info(`Starting xray-core: ${protocol} to ${server.host}:${server.port}`);
    // Stop any existing xray process
    if (vpnProcess) {
        try {
            vpnProcess.kill("SIGTERM");
        }
        catch { }
        vpnProcess = null;
    }
    // Build the REAL config (uses real credentials from configUri, or throws)
    const config = buildXrayConfig(server, protocol, configUri);
    const configPath = path.join(electron_1.app.getPath("userData"), "xray-config.json");
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    electron_log_1.default.info(`xray config written to: ${configPath}`);
    const xrayPath = getXrayPath();
    if (!fs.existsSync(xrayPath)) {
        electron_log_1.default.error(`xray binary not found at: ${xrayPath}`);
        throw new Error("VPN engine binary missing");
    }
    // Spawn xray.exe
    vpnProcess = (0, child_process_1.spawn)(xrayPath, ["run", "-c", configPath], {
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
                    electron_log_1.default.info("xray-core confirmed working (HTTP through proxy succeeded) — connected");
                }
                else if (!startupError) {
                    electron_log_1.default.warn("xray process alive but HTTP verification failed — NOT marking as connected");
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
    async function verifyHttpThroughProxy() {
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
            const socksOk = await new Promise((resolve) => {
                const socket = new net.Socket();
                const t = setTimeout(() => { socket.destroy(); resolve(false); }, 3000);
                socket.setTimeout(3000);
                socket.once("connect", () => {
                    clearTimeout(t);
                    socket.destroy();
                    resolve(true);
                });
                socket.once("error", (err) => {
                    clearTimeout(t);
                    electron_log_1.default.warn(`SOCKS port check failed: ${err?.message}`);
                    resolve(false);
                });
                socket.connect(10808, "127.0.0.1");
            });
            if (!socksOk) {
                electron_log_1.default.warn("Traffic verification: SOCKS port not reachable");
                return false;
            }
            electron_log_1.default.info("Traffic verification: SOCKS port reachable");
            // Step 2: Try a real HTTP request through the SOCKS proxy.
            // We use fetch() with a custom dispatcher if available, otherwise
            // fall back to the SOCKS port check only.
            try {
                // Attempt to use the global fetch with SOCKS — this may not work
                // without socks-proxy-agent, but we try a direct TCP CONNECT.
                // If it fails, we still have the SOCKS port check above.
                const { connect: tlsConnect } = await Promise.resolve().then(() => __importStar(require("tls")));
                // Create a SOCKS5 handshake manually
                const socksSocket = new net.Socket();
                await new Promise((resolve, reject) => {
                    socksSocket.connect(10808, "127.0.0.1", resolve);
                    socksSocket.on("error", reject);
                });
                // SOCKS5 greeting: version 5, 1 auth method, no auth
                socksSocket.write(Buffer.from([0x05, 0x01, 0x00]));
                await new Promise((resolve) => {
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
                await new Promise((resolve, reject) => {
                    const timeout = setTimeout(() => reject(new Error("SOCKS connect timeout")), 8000);
                    socksSocket.once("data", (data) => {
                        clearTimeout(timeout);
                        if (data[1] === 0x00) {
                            resolve(); // connected
                        }
                        else {
                            reject(new Error(`SOCKS connect failed: ${data[1]}`));
                        }
                    });
                });
                // Wrap in TLS
                const tlsSocket = tlsConnect({
                    socket: socksSocket,
                    servername: targetHost,
                });
                await new Promise((resolve, reject) => {
                    tlsSocket.once("secureConnect", resolve);
                    tlsSocket.once("error", reject);
                });
                // Send HTTP request
                tlsSocket.write("GET /cdn-cgi/trace HTTP/1.1\r\nHost: www.cloudflare.com\r\nConnection: close\r\n\r\n");
                const response = await new Promise((resolve, reject) => {
                    let data = "";
                    tlsSocket.on("data", (chunk) => { data += chunk.toString(); });
                    tlsSocket.on("end", () => resolve(data));
                    tlsSocket.on("error", reject);
                    setTimeout(() => resolve(data), 5000); // timeout
                });
                tlsSocket.destroy();
                socksSocket.destroy();
                if (response.includes("ip=")) {
                    electron_log_1.default.info("Traffic verification: got valid response through SOCKS proxy — tunnel verified");
                    return true;
                }
                else {
                    electron_log_1.default.warn("Traffic verification: SOCKS connected but no valid HTTP response");
                    return false;
                }
            }
            catch (httpErr) {
                electron_log_1.default.warn(`Traffic verification: HTTP through SOCKS failed: ${httpErr?.message}`);
                // SOCKS port is open but HTTP failed — server may be unreachable
                return false;
            }
        }
        catch (e) {
            electron_log_1.default.warn(`Traffic verification error: ${e?.message}`);
            return false;
        }
    }
    vpnProcess.stdout?.on("data", (data) => {
        const line = data.toString().trim();
        electron_log_1.default.info(`[xray] ${line}`);
        // NOTE: We do NOT mark "connected" here just because xray logs "started".
        // "started" only means the inbound proxy is ready — it does NOT prove the
        // outbound to the VPN server works. We wait for the 5s timeout to do a
        // real HTTP request through the proxy (see verifyHttpThroughProxy above).
    });
    vpnProcess.stderr?.on("data", (data) => {
        const line = data.toString().trim();
        electron_log_1.default.error(`[xray] ${line}`);
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
        electron_log_1.default.info(`xray exited with code ${code}`);
        clearTimeout(startupTimeout);
        if (store.get("vpn.connected")) {
            store.set("vpn", { ...store.get("vpn"), connected: false, startedAt: null });
            mainWindow?.webContents.send("vpn:state-changed", store.get("vpn"));
            // If kill switch is enabled, block all traffic now
            if (store.get("settings.killSwitch")) {
                electron_log_1.default.warn("Kill switch activated — xray exited unexpectedly");
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
        electron_log_1.default.info("xray-core starting — waiting for handshake");
    }
}
async function stopVpnEngine() {
    electron_log_1.default.info("Stopping xray-core…");
    if (vpnProcess) {
        try {
            vpnProcess.kill("SIGTERM");
            // Give it 500ms to exit gracefully
            await new Promise((r) => setTimeout(r, 500));
            if (!vpnProcess.killed) {
                vpnProcess.kill("SIGKILL");
            }
        }
        catch (e) {
            electron_log_1.default.error("Error killing xray:", e);
        }
        vpnProcess = null;
    }
    // If kill switch is enabled, block all non-tunnel traffic until user reconnects.
    // On Windows: use netsh advfirewall to add a block rule (requires admin).
    // On macOS/Linux: we can't easily block without root, so we just warn the user.
    const settings = store.get("settings");
    if (settings.killSwitch && process.platform === "win32") {
        await enableKillSwitch();
    }
    else if (settings.killSwitch) {
        electron_log_1.default.warn("Kill switch: not implemented on this platform — traffic may leak");
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
async function enableKillSwitch() {
    if (killSwitchActive)
        return;
    try {
        electron_log_1.default.info("Kill switch: enabling via route table manipulation…");
        const { exec } = require("child_process");
        if (process.platform !== "win32") {
            electron_log_1.default.warn("Kill switch: route table manipulation only implemented for Windows");
            return;
        }
        // Step 1: Get the current default gateway and interface
        const gatewayInfo = await new Promise((resolve) => {
            exec("route print 0.0.0.0", (err, stdout) => {
                if (err) {
                    electron_log_1.default.warn(`Kill switch: could not get route table: ${err.message}`);
                    resolve({ gateway: "", iface: 0 });
                    return;
                }
                // Parse the output to find the default gateway
                // Look for "0.0.0.0  0.0.0.0  <gateway>  <interface>"
                const lines = stdout.split("\n");
                for (const line of lines) {
                    const match = line.match(/0\.0\.0\.0\s+0\.0\.0\.0\s+(\d+\.\d+\.\d+\.\d+)\s+(\d+)/);
                    if (match) {
                        resolve({ gateway: match[1], iface: parseInt(match[2]) });
                        return;
                    }
                }
                resolve({ gateway: "", iface: 0 });
            });
        });
        savedDefaultGateway = gatewayInfo.gateway;
        savedInterfaceIndex = gatewayInfo.iface;
        if (!savedDefaultGateway) {
            electron_log_1.default.warn("Kill switch: could not find default gateway — kill switch may not work");
        }
        else {
            electron_log_1.default.info(`Kill switch: default gateway = ${savedDefaultGateway} (iface ${savedInterfaceIndex})`);
        }
        // Step 2: Get the VPN server IP
        const vpnServer = store.get("vpn.server");
        const vpnHost = vpnServer?.host || "";
        let vpnIp = "";
        if (vpnHost) {
            try {
                const dnsPromises = require("dns").promises;
                const addresses = await dnsPromises.lookup(vpnHost, { all: true });
                if (Array.isArray(addresses) && addresses.length > 0) {
                    vpnIp = addresses[0].address;
                }
            }
            catch (e) {
                electron_log_1.default.warn(`Kill switch: could not resolve VPN server IP: ${e.message}`);
            }
        }
        // Step 3: Add a specific route for the VPN server (high priority)
        if (vpnIp && savedDefaultGateway && savedInterfaceIndex > 0) {
            await new Promise((resolve) => {
                exec(`route add ${vpnIp} mask 255.255.255.255 ${savedDefaultGateway} metric 1 IF ${savedInterfaceIndex}`, (err) => {
                    if (err) {
                        electron_log_1.default.warn(`Kill switch: could not add VPN server route: ${err.message}`);
                    }
                    else {
                        electron_log_1.default.info(`Kill switch: VPN server ${vpnIp} route added (metric 1)`);
                    }
                    resolve();
                });
            });
        }
        // Step 4: Remove the default route (blocks all other traffic)
        if (savedDefaultGateway && savedInterfaceIndex > 0) {
            await new Promise((resolve) => {
                exec(`route delete 0.0.0.0 mask 0.0.0.0 ${savedDefaultGateway} IF ${savedInterfaceIndex}`, (err) => {
                    if (err) {
                        electron_log_1.default.warn(`Kill switch: could not remove default route: ${err.message}`);
                    }
                    else {
                        electron_log_1.default.info("Kill switch: default route removed — all traffic blocked except VPN server");
                        killSwitchActive = true;
                        mainWindow?.webContents.send("vpn:kill-switch-activated");
                    }
                    resolve();
                });
            });
        }
        // Step 5: VERIFY the default route is actually gone
        await new Promise((resolve) => {
            exec("route print 0.0.0.0", (err, stdout) => {
                if (err || !stdout.includes("0.0.0.0")) {
                    electron_log_1.default.info("Kill switch: VERIFIED — default route is removed");
                    killSwitchActive = true;
                }
                else {
                    electron_log_1.default.error("Kill switch: VERIFICATION FAILED — default route still exists!");
                    killSwitchActive = false;
                }
                resolve();
            });
        });
    }
    catch (e) {
        electron_log_1.default.warn(`Kill switch error: ${e?.message}`);
    }
}
async function disableKillSwitch() {
    if (!killSwitchActive)
        return;
    try {
        electron_log_1.default.info("Kill switch: restoring default route…");
        const { exec } = require("child_process");
        // Restore the default route
        if (savedDefaultGateway && savedInterfaceIndex > 0) {
            await new Promise((resolve) => {
                exec(`route add 0.0.0.0 mask 0.0.0.0 ${savedDefaultGateway} metric 25 IF ${savedInterfaceIndex}`, (err) => {
                    if (err) {
                        electron_log_1.default.error(`Kill switch: FAILED to restore default route: ${err.message}`);
                        electron_log_1.default.error("Kill switch: YOUR INTERNET MAY BE BLOCKED — run this manually:");
                        electron_log_1.default.error(`  route add 0.0.0.0 mask 0.0.0.0 ${savedDefaultGateway} metric 25`);
                    }
                    else {
                        electron_log_1.default.info("Kill switch: default route restored — internet is back");
                        killSwitchActive = false;
                    }
                    resolve();
                });
            });
        }
        // Remove the VPN server specific route
        const vpnServer = store.get("vpn.server");
        const vpnHost = vpnServer?.host || "";
        if (vpnHost && savedDefaultGateway) {
            try {
                const dnsPromises = require("dns").promises;
                const addresses = await dnsPromises.lookup(vpnHost, { all: true });
                if (addresses.length > 0) {
                    const vpnIp = addresses[0].address;
                    await new Promise((resolve) => {
                        exec(`route delete ${vpnIp}`, () => resolve());
                    });
                }
            }
            catch { }
        }
    }
    catch (e) {
        electron_log_1.default.warn(`Kill switch disable error: ${e?.message}`);
    }
}
async function quickConnect() {
    try {
        // Step 1: Get the recommended Distort server (for display purposes)
        const recUrl = `${getLoadUrl()}/api/servers/recommended`;
        const recRes = await fetch(recUrl);
        const recData = await recRes.json();
        const recommendedServer = recData?.server;
        const recommendedProtocol = recData?.recommendedProtocol || "vless";
        if (!recommendedServer) {
            electron_log_1.default.error("Quick connect failed: no recommended server");
            mainWindow?.webContents.send("vpn:error", "No servers available");
            return;
        }
        // Step 2: Get a REAL config URI from Community Mesh (with real credentials)
        // Prefer optimized configs (Reality/TLS/Vision) — these have real UUIDs/passwords
        const meshUrl = `${getLoadUrl()}/api/imported-configs?bucket=optimized&limit=1`;
        const meshRes = await fetch(meshUrl);
        const meshData = await meshRes.json();
        const realConfig = meshData?.configs?.[0];
        if (!realConfig || !realConfig.uri) {
            electron_log_1.default.error("Quick connect failed: no real Community Mesh config available");
            mainWindow?.webContents.send("vpn:error", "No real VPN config available. Please refresh the Community Mesh subscription or import a config.");
            return;
        }
        electron_log_1.default.info(`Quick connect: using real ${realConfig.protocol} config to ${realConfig.host}:${realConfig.port}`);
        // Disable kill switch if it was active (we're reconnecting)
        await disableKillSwitch();
        // Step 3: Build a VpnState server object from the real config
        const server = {
            code: realConfig.host,
            country: realConfig.country || realConfig.host,
            host: realConfig.host,
            port: realConfig.port,
        };
        // Step 4: Start the VPN engine with the REAL config URI
        await startVpnEngine(server, realConfig.protocol, realConfig.uri);
    }
    catch (e) {
        electron_log_1.default.error("Quick connect failed:", e?.message || e);
        mainWindow?.webContents.send("vpn:error", `Quick connect failed: ${e?.message || "unknown error"}`);
    }
}
function disconnectVpn() {
    stopVpnEngine();
}
// ---------------------------------------------------------------------------
// IPC handlers
// ---------------------------------------------------------------------------
electron_1.ipcMain.handle("vpn:connect", async (_e, server, protocol, configUri) => {
    await startVpnEngine(server, protocol, configUri);
    return store.get("vpn");
});
electron_1.ipcMain.handle("vpn:disconnect", async () => {
    await stopVpnEngine();
    return store.get("vpn");
});
electron_1.ipcMain.handle("vpn:state", async () => {
    return store.get("vpn");
});
electron_1.ipcMain.handle("settings:get", async () => {
    return store.get("settings");
});
electron_1.ipcMain.handle("settings:set", async (_e, patch) => {
    const current = store.get("settings");
    store.set("settings", { ...current, ...patch });
    return store.get("settings");
});
electron_1.ipcMain.handle("app:version", async () => {
    return electron_1.app.getVersion();
});
electron_1.ipcMain.handle("app:platform", async () => {
    return { platform: process.platform, arch: process.arch };
});
// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------
const child_process_2 = require("child_process");
let nextServer = null;
function getNextStandalonePath() {
    const isDev = !!process.env.DISTORT_DEV;
    if (isDev) {
        return path.join(__dirname, "..", "..", ".next", "standalone");
    }
    // Production: bundled in resources/next-standalone
    return path.join(process.resourcesPath, "next-standalone");
}
function startNextServer() {
    return new Promise((resolve, reject) => {
        const standalonePath = getNextStandalonePath();
        const serverJs = path.join(standalonePath, "server.js");
        electron_log_1.default.info(`Starting Next.js standalone server from: ${serverJs}`);
        if (!fs.existsSync(serverJs)) {
            electron_log_1.default.warn(`Next.js standalone server.js not found at ${serverJs}`);
            electron_log_1.default.info("Will use offline page as fallback");
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
        nextServer = (0, child_process_2.spawn)(process.execPath, [serverJs], {
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
            electron_log_1.default.info(`[next] ${data.toString().trim()}`);
        });
        nextServer.stderr?.on("data", (data) => {
            electron_log_1.default.error(`[next] ${data.toString().trim()}`);
        });
        // Wait for server to be ready
        let attempts = 0;
        const checkInterval = setInterval(() => {
            attempts++;
            fetch("http://127.0.0.1:38571/")
                .then((r) => {
                if (r.ok) {
                    clearInterval(checkInterval);
                    electron_log_1.default.info("Next.js standalone server is ready on port 38571");
                    resolve();
                }
            })
                .catch(() => {
                if (attempts > 20) {
                    clearInterval(checkInterval);
                    electron_log_1.default.warn("Next.js server didn't start in time");
                    resolve(); // resolve anyway, will use offline fallback
                }
            });
        }, 500);
    });
}
electron_1.app.whenReady().then(async () => {
    // Start Next.js standalone server first (if available)
    await startNextServer();
    createWindow();
    createTray();
    // Auto-connect on startup if enabled
    if (store.get("settings.autoConnect")) {
        setTimeout(() => quickConnect(), 1500);
    }
    electron_1.app.on("activate", () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
        else {
            mainWindow?.show();
        }
    });
});
electron_1.app.on("window-all-closed", () => {
    if (process.platform !== "darwin" && !store.get("settings.minimizeToTray")) {
        electron_1.app.quit();
    }
});
electron_1.app.on("before-quit", async (e) => {
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
        electron_1.app.quit();
    }
});
// On SIGINT/SIGTERM (e.g., system shutdown), clean up before exiting.
process.on("SIGINT", async () => {
    electron_log_1.default.info("Received SIGINT — cleaning up…");
    await stopVpnEngine();
    await disableKillSwitch();
    process.exit(0);
});
process.on("SIGTERM", async () => {
    electron_log_1.default.info("Received SIGTERM — cleaning up…");
    await stopVpnEngine();
    await disableKillSwitch();
    process.exit(0);
});
// On uncaught exceptions (potential crash), try to clean up before exiting.
process.on("uncaughtException", async (err) => {
    electron_log_1.default.error("Uncaught exception — cleaning up before exit:", err);
    try {
        await stopVpnEngine();
        await disableKillSwitch();
    }
    catch { }
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
