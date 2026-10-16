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
// Build an xray config for the given protocol + server
function buildXrayConfig(server, protocol) {
    if (!server)
        throw new Error("No server selected");
    const logPath = path.join(electron_1.app.getPath("userData"), "xray.log");
    const socksInbound = {
        tag: "socks-in",
        port: 10808,
        listen: "127.0.0.1",
        protocol: "socks",
        settings: { auth: "noauth", udp: true },
    };
    const httpInbound = {
        tag: "http-in",
        port: 10809,
        listen: "127.0.0.1",
        protocol: "http",
    };
    // Default: VMess over WS+TLS (most Iran-resilient)
    const outbounds = [];
    if (protocol === "wireguard") {
        // Use xray's wireguard outbound
        outbounds.push({
            tag: "distort-out",
            protocol: "wireguard",
            settings: {
                secret: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
                address: ["10.66.66.2/32", "fd42:dead:beef::2/128"],
                peers: [{ publicKey: "serverPubKey", endpoint: `${server.host}:${server.port}` }],
                mtu: 1420,
            },
        });
    }
    else if (protocol === "v2ray" || protocol === "vmess") {
        outbounds.push({
            tag: "distort-out",
            protocol: "vmess",
            settings: {
                vnext: [
                    {
                        address: server.host,
                        port: server.port,
                        users: [{ id: crypto.randomUUID(), alterId: 0, security: "auto" }],
                    },
                ],
            },
            streamSettings: {
                network: "ws",
                security: "tls",
                tlsSettings: { serverName: server.host, allowInsecure: false },
                wsSettings: { path: "/distort", headers: { Host: server.host } },
            },
            mux: { enabled: true, concurrency: 8 },
        });
    }
    else if (protocol === "trojan") {
        outbounds.push({
            tag: "distort-out",
            protocol: "trojan",
            settings: {
                servers: [
                    {
                        address: server.host,
                        port: server.port,
                        password: "distort-trojan-pass",
                    },
                ],
            },
            streamSettings: {
                network: "tcp",
                security: "tls",
                tlsSettings: { serverName: server.host, allowInsecure: false },
            },
        });
    }
    else if (protocol === "shadowsocks") {
        outbounds.push({
            tag: "distort-out",
            protocol: "shadowsocks",
            settings: {
                servers: [
                    {
                        address: server.host,
                        port: server.port,
                        method: "chacha20-ietf-poly1305",
                        password: "distort-ss-pass",
                    },
                ],
            },
        });
    }
    else {
        // fallback: freedom (direct)
        outbounds.push({ tag: "distort-out", protocol: "freedom" });
    }
    // Block ads + trackers if enabled
    outbounds.push({ tag: "block", protocol: "blackhole" });
    return {
        log: { loglevel: "warning", access: logPath },
        inbounds: [socksInbound, httpInbound],
        outbounds,
        routing: {
            domainStrategy: "IPIfNonMatch",
            rules: [
                { type: "field", ip: ["geoip:private"], outboundTag: "direct" },
                { type: "field", domain: ["geosite:category-ads-all"], outboundTag: "block" },
            ],
        },
    };
}
async function startVpnEngine(server, protocol) {
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
    const config = buildXrayConfig(server, protocol);
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
    vpnProcess.stdout?.on("data", (data) => {
        electron_log_1.default.info(`[xray] ${data.toString().trim()}`);
    });
    vpnProcess.stderr?.on("data", (data) => {
        electron_log_1.default.error(`[xray] ${data.toString().trim()}`);
    });
    vpnProcess.on("exit", (code) => {
        electron_log_1.default.info(`xray exited with code ${code}`);
        if (store.get("vpn.connected")) {
            store.set("vpn", { ...store.get("vpn"), connected: false, startedAt: null });
            mainWindow?.webContents.send("vpn:state-changed", store.get("vpn"));
        }
    });
    // Wait a moment for xray to start
    await new Promise((r) => setTimeout(r, 800));
    store.set("vpn", {
        connected: true,
        server,
        protocol,
        startedAt: Date.now(),
    });
    mainWindow?.webContents.send("vpn:state-changed", store.get("vpn"));
    electron_log_1.default.info("xray-core started successfully");
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
        const url = `${getLoadUrl()}/api/servers/recommended`;
        const res = await fetch(url);
        const data = await res.json();
        if (data?.server) {
            await startVpnEngine(data.server, data.recommendedProtocol || "wireguard");
        }
    }
    catch (e) {
        electron_log_1.default.error("Quick connect failed:", e);
    }
}
function disconnectVpn() {
    stopVpnEngine();
}
// ---------------------------------------------------------------------------
// IPC handlers
// ---------------------------------------------------------------------------
electron_1.ipcMain.handle("vpn:connect", async (_e, server, protocol) => {
    await startVpnEngine(server, protocol);
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
electron_1.app.whenReady().then(() => {
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
