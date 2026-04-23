const { contextBridge, ipcRenderer } = require('electron');

// Expose printer API to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Check if running in Electron
  isElectron: true,

  // Printer operations
  printer: {
    checkStatus: (printers) => ipcRenderer.invoke('printer:check-status', printers),
    quickStatus: (printers) => ipcRenderer.invoke('printer:quick-status', printers),
    setMeta: (printer) => ipcRenderer.invoke('printer:set-meta', printer),
    connect: (printer) => ipcRenderer.invoke('printer:connect', printer),
    disconnect: (printerId) => ipcRenderer.invoke('printer:disconnect', printerId),
    sendCommand: (printerId, command, options) => 
      ipcRenderer.invoke('printer:send-command', { printerId, command, options }),
  },

  // One-to-One Print Mode (Protocol v2.6 §6.1)
  oneToOne: {
    attach: (printerId) => ipcRenderer.invoke('oneToOne:attach', { printerId }),
    detach: (printerId) => ipcRenderer.invoke('oneToOne:detach', { printerId }),
    sendMD: (printerId, command) => ipcRenderer.invoke('oneToOne:sendMD', { printerId, command }),
    onAck: (callback) => {
      const handler = (_event, payload) => callback(payload);
      ipcRenderer.on('oneToOne:ack', handler);
      return () => ipcRenderer.removeListener('oneToOne:ack', handler);
    },
  },

  // Hotfolder operations
  hotfolder: {
    configure: (config) => ipcRenderer.invoke('hotfolder:configure', config),
  },
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
    getUpdateState: () => ipcRenderer.invoke('app:get-update-state'),
    getUpdaterLog: () => ipcRenderer.invoke('app:get-updater-log'),
    getScreenSources: () => ipcRenderer.invoke('app:get-screen-sources'),
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

  // Polling pause events (from mobile companion via relay)
  onPollingPauseChanged: (callback) => {
    ipcRenderer.on('polling:pause-changed', (event, paused) => callback(paused));
  },

  // Hotfolder events
  onHotfolderNewFile: (callback) => {
    ipcRenderer.on('hotfolder:new-file', (event, data) => callback(data));
  },
});
