const { app, BrowserWindow, ipcMain } = require('electron');
const net = require('net');
const path = require('path');

let mainWindow;

// Dev/prod detection
// - When running locally via `npx electron ...`, NODE_ENV is often undefined.
// - `app.isPackaged` is the most reliable signal.
const isDev = !app.isPackaged || process.env.NODE_ENV === 'development';

// Auto-updater (optional)
let autoUpdater;
if (!isDev && app.isPackaged) {
  try {
    // electron-updater is only needed for packaged production builds.
    ({ autoUpdater } = require('electron-updater'));
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
  } catch (e) {
    console.warn('[auto-updater] electron-updater not installed; updates disabled');
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, '../public/favicon.ico'),
  });

  // In development, load from Vite dev server
  // In production, load the built files
  const devServerUrl =
    process.env.VITE_DEV_SERVER_URL ||
    process.env.ELECTRON_RENDERER_URL ||
    'http://localhost:8080';

  if (isDev) {
    mainWindow.loadURL(devServerUrl);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Check for updates after window is ready
  mainWindow.once('ready-to-show', () => {
    autoUpdater?.checkForUpdatesAndNotify?.();
  });
}

// TCP connection management
const connections = new Map();

ipcMain.handle('printer:check-status', async (event, printers) => {
  const results = await Promise.all(
    printers.map(async (printer) => {
      const startTime = Date.now();
      
      return new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(3000);

        socket.on('connect', () => {
          const responseTime = Date.now() - startTime;
          
          // Send status query command
          socket.write('^S\r');
          
          let data = '';
          socket.on('data', (chunk) => {
            data += chunk.toString();
          });

          setTimeout(() => {
            socket.destroy();
            const isReady = data.includes('READY') || data.includes('OK') || data.length > 0;
            resolve({
              id: printer.id,
              isAvailable: true,
              status: isReady ? 'ready' : 'not_ready',
              responseTime,
            });
          }, 1000);
        });

        socket.on('timeout', () => {
          socket.destroy();
          resolve({
            id: printer.id,
            isAvailable: false,
            status: 'offline',
            error: 'Connection timeout',
          });
        });

        socket.on('error', (err) => {
          socket.destroy();
          resolve({
            id: printer.id,
            isAvailable: false,
            status: 'offline',
            error: err.message,
          });
        });

        socket.connect(printer.port, printer.ipAddress);
      });
    })
  );

  return results;
});

ipcMain.handle('printer:connect', async (event, printer) => {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    socket.setTimeout(5000);

    socket.on('connect', () => {
      connections.set(printer.id, socket);
      resolve({ success: true });
    });

    socket.on('error', (err) => {
      reject({ success: false, error: err.message });
    });

    socket.on('close', () => {
      connections.delete(printer.id);
    });

    socket.connect(printer.port, printer.ipAddress);
  });
});

ipcMain.handle('printer:disconnect', async (event, printerId) => {
  const socket = connections.get(printerId);
  if (socket) {
    socket.destroy();
    connections.delete(printerId);
  }
  return { success: true };
});

ipcMain.handle('printer:send-command', async (event, { printerId, command }) => {
  const socket = connections.get(printerId);
  if (!socket) {
    throw new Error('Printer not connected');
  }

  return new Promise((resolve, reject) => {
    socket.write(command + '\r', (err) => {
      if (err) {
        reject({ success: false, error: err.message });
      } else {
        // Wait for response
        let data = '';
        const onData = (chunk) => {
          data += chunk.toString();
        };
        socket.on('data', onData);

        setTimeout(() => {
          socket.off('data', onData);
          resolve({ success: true, response: data });
        }, 500);
      }
    });
  });
});

if (autoUpdater) {
  // Auto-updater events
  autoUpdater.on('update-available', (info) => {
    mainWindow?.webContents.send('update-available', info);
  });

  autoUpdater.on('update-downloaded', (info) => {
    mainWindow?.webContents.send('update-downloaded', info);
  });

  autoUpdater.on('error', (err) => {
    console.error('Auto-updater error:', err);
  });
}

ipcMain.handle('app:check-for-updates', () => {
  autoUpdater?.checkForUpdatesAndNotify?.();
});

ipcMain.handle('app:install-update', () => {
  autoUpdater?.quitAndInstall?.();
});

ipcMain.handle('app:get-version', () => {
  return app.getVersion();
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  // Close all printer connections
  connections.forEach((socket) => socket.destroy());
  connections.clear();
  
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
