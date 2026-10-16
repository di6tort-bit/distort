const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('distort', Object.freeze({
  version: () => '0.1.0',
  capabilities: () => Object.freeze({
    desktopShell: true,
    vpnEngine: false,
    communityServersConfigured: false
  }),
  openRepository: () => ipcRenderer.invoke('distort:open-repository')
}));
