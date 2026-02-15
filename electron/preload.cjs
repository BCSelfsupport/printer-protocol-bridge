const { contextBridge, ipcRenderer } = require('electron');

// Expose printer API to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Check if running in Electron
  isElectron: true,

  // Printer operations
  printer: {
    checkStatus: (printers) => ipcRenderer.invoke('printer:check-status', printers),
    setMeta: (printer) => ipcRenderer.invoke('printer:set-meta', printer),
    connect: (printer) => ipcRenderer.invoke('printer:connect', printer),
    disconnect: (printerId) => ipcRenderer.invoke('printer:disconnect', printerId),
    sendCommand: (printerId, command) => 
      ipcRenderer.invoke('printer:send-command', { printerId, command }),
  },

  // Relay server info
  relay: {
    getInfo: () => ipcRenderer.invoke('relay:get-info'),
  },

  // App operations
  app: {
    getVersion: () => ipcRenderer.invoke('app:get-version'),
    checkForUpdates: () => ipcRenderer.invoke('app:check-for-updates'),
    installUpdate: () => ipcRenderer.invoke('app:install-update'),
    toggleFullscreen: () => ipcRenderer.invoke('app:toggle-fullscreen'),
    isFullscreen: () => ipcRenderer.invoke('app:is-fullscreen'),
  },

  // Update events
  onUpdateAvailable: (callback) => {
    ipcRenderer.on('update-available', (event, info) => callback(info));
  },
  onUpdateDownloadProgress: (callback) => {
    ipcRenderer.on('update-download-progress', (event, progress) => callback(progress));
  },
  onUpdateDownloaded: (callback) => {
    ipcRenderer.on('update-downloaded', (event, info) => callback(info));
  },

  // Printer events
  onPrinterConnectionLost: (callback) => {
    ipcRenderer.on('printer:connection-lost', (event, payload) => callback(payload));
  },

  // Relay events
  onRelayInfo: (callback) => {
    ipcRenderer.on('relay:info', (event, info) => callback(info));
  },
});
