// DISTORT Desktop — preload script
// Exposes a safe, minimal API to the renderer (sandboxed).

import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("distort", {
  // VPN
  vpn: {
    connect: (server: unknown, protocol: string) => ipcRenderer.invoke("vpn:connect", server, protocol),
    disconnect: () => ipcRenderer.invoke("vpn:disconnect"),
    getState: () => ipcRenderer.invoke("vpn:state"),
    onStateChange: (cb: (state: unknown) => void) => {
      const handler = (_e: unknown, state: unknown) => cb(state);
      ipcRenderer.on("vpn:state-changed", handler);
      return () => ipcRenderer.removeListener("vpn:state-changed", handler);
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
