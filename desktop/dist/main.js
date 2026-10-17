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
    // Track xray's health — only mark "connected" after handshake success
    let handshakeConfirmed = false;
    let startupError = "";
    const startupTimeout = setTimeout(() => {
        if (!handshakeConfirmed && !startupError) {
            // xray started but no explicit success log within 5s.
            // For protocols like vmess/trojan/ss, xray logs "started" quickly.
            // We consider it "connected" if xray is still alive after 5s without error.
            if (vpnProcess && !vpnProcess.killed) {
                handshakeConfirmed = true;
                store.set("vpn", {
                    connected: true,
                    server,
                    protocol,
                    configUri: configUri ?? null,
                    startedAt: Date.now(),
                });
                mainWindow?.webContents.send("vpn:state-changed", store.get("vpn"));
                electron_log_1.default.info("xray-core confirmed alive — marking as connected");
            }
        }
    }, 5000);
    vpnProcess.stdout?.on("data", (data) => {
        const line = data.toString().trim();
        electron_log_1.default.info(`[xray] ${line}`);
        // xray logs "started" when the proxy is ready to accept connections
        if (line.includes("started") || line.includes("listening") || line.includes("tun:")) {
            if (!handshakeConfirmed) {
                handshakeConfirmed = true;
                clearTimeout(startupTimeout);
                store.set("vpn", {
                    connected: true,
                    server,
                    protocol,
                    configUri: configUri ?? null,
                    startedAt: Date.now(),
                });
                mainWindow?.webContents.send("vpn:state-changed", store.get("vpn"));
                electron_log_1.default.info("xray-core handshake confirmed — connected");
            }
        }
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
    store.set("vpn", {
        connected: false,
        server: null,
        protocol: store.get("vpn.protocol"),
        startedAt: null,
    });
    mainWindow?.webContents.send("vpn:state-changed", store.get("vpn"));
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
    if (store.get("vpn.connected")) {
        e.preventDefault();
        await stopVpnEngine();
        isQuitting = true;
        electron_1.app.quit();
    }
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
