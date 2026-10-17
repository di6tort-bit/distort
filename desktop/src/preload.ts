// DISTORT Desktop — preload script
// Exposes a safe, minimal API to the renderer (sandboxed).

import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("distort", {
  // VPN
  vpn: {
    connect: (server: unknown, protocol: string, configUri?: string) =>
      ipcRenderer.invoke("vpn:connect", server, protocol, configUri),
    disconnect: () => ipcRenderer.invoke("vpn:disconnect"),
    getState: () => ipcRenderer.invoke("vpn:state"),
    onStateChange: (cb: (state: unknown) => void) => {
      const handler = (_e: unknown, state: unknown) => cb(state);
      ipcRenderer.on("vpn:state-changed", handler);
      return () => ipcRenderer.removeListener("vpn:state-changed", handler);
    },
    onConnecting: (cb: (info: { attempt: number; total: number; host: string; protocol: string }) => void) => {
      const handler = (_e: unknown, info: any) => cb(info);
      ipcRenderer.on("vpn:connecting", handler);
      return () => ipcRenderer.removeListener("vpn:connecting", handler);
    },
    onReconnecting: (cb: (info: { attempt: number; maxAttempts: number; delayMs: number; lastCountry?: string }) => void) => {
      const handler = (_e: unknown, info: any) => cb(info);
      ipcRenderer.on("vpn:reconnecting", handler);
      return () => ipcRenderer.removeListener("vpn:reconnecting", handler);
    },
    onCountryChange: (cb: (info: { from: string; to: string; message: string }) => void) => {
      const handler = (_e: unknown, info: any) => cb(info);
      ipcRenderer.on("vpn:country-change", handler);
      return () => ipcRenderer.removeListener("vpn:country-change", handler);
    },
    onExitInfo: (cb: (info: { exitIp: string; exitCountry: string }) => void) => {
      const handler = (_e: unknown, info: { exitIp: string; exitCountry: string }) => cb(info);
      ipcRenderer.on("vpn:exit-info", handler);
      return () => ipcRenderer.removeListener("vpn:exit-info", handler);
    },
    onError: (cb: (error: string) => void) => {
      const handler = (_e: unknown, err: string) => cb(err);
      ipcRenderer.on("vpn:error", handler);
      return () => ipcRenderer.removeListener("vpn:error", handler);
    },
    onKillSwitch: (cb: () => void) => {
      const handler = () => cb();
      ipcRenderer.on("vpn:kill-switch-activated", handler);
      return () => ipcRenderer.removeListener("vpn:kill-switch-activated", handler);
    },
  },
  // Settings
  settings: {
    get: () => ipcRenderer.invoke("settings:get"),
    set: (patch: Record<string, unknown>) => ipcRenderer.invoke("settings:set", patch),
  },
  // App info
  app: {
    version: () => ipcRenderer.invoke("app:version"),
    platform: () => ipcRenderer.invoke("app:platform"),
  },
  // Navigation (from tray)
  onNavigate: (cb: (view: string) => void) => {
    const handler = (_e: unknown, view: string) => cb(view);
    ipcRenderer.on("navigate", handler);
    return () => ipcRenderer.removeListener("navigate", handler);
  },
  // Capabilities — what the desktop shell can actually do
  capabilities: {
    desktopShell: true,
    vpnEngine: true, // ✅ xray-core is bundled and integrated
    autoUpdate: true,
    systemTray: true,
    minimizeToTray: true,
    communityServersConfigured: true,
    socksProxy: { host: "127.0.0.1", port: 10808 },
    httpProxy: { host: "127.0.0.1", port: 10809 },
  },
});
