const { contextBridge, ipcRenderer } = require('electron');

// Expose printer API to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Check if running in Electron
  isElectron: true,

  // Printer operations
  printer: {
    checkStatus: (printers) => ipcRenderer.invoke('printer:check-status', printers),
    connect: (printer) => ipcRenderer.invoke('printer:connect', printer),
    disconnect: (printerId) => ipcRenderer.invoke('printer:disconnect', printerId),
    sendCommand: (printerId, command) => 
      ipcRenderer.invoke('printer:send-command', { printerId, command }),
  },

  // App operations
  app: {
    getVersion: () => ipcRenderer.invoke('app:get-version'),
    checkForUpdates: () => ipcRenderer.invoke('app:check-for-updates'),
    installUpdate: () => ipcRenderer.invoke('app:install-update'),
  },

  // Update events
  onUpdateAvailable: (callback) => {
    ipcRenderer.on('update-available', (event, info) => callback(info));
  },
  onUpdateDownloaded: (callback) => {
    ipcRenderer.on('update-downloaded', (event, info) => callback(info));
  },
});
