const { app, BrowserWindow, ipcMain } = require('electron');
const net = require('net');
const { execFile } = require('child_process');
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
// Store last-known connection details so we can reconnect on demand.
const printerMeta = new Map();

// --- Telnet helpers (port 23) ---
// Some embedded Telnet servers immediately close if the client doesn't respond
// to option negotiation (IAC sequences). We implement a minimal "refuse everything"
// negotiation to keep the socket open.
const TELNET = {
  IAC: 255,
  DONT: 254,
  DO: 253,
  WONT: 252,
  WILL: 251,
  SB: 250,
  SE: 240,
};

function handleTelnetNegotiation(socket, buf) {
  if (!Buffer.isBuffer(buf) || buf.length === 0) return false;
  if (!buf.includes(TELNET.IAC)) return false;

  const replies = [];
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] !== TELNET.IAC) continue;
    const cmd = buf[i + 1];
    const opt = buf[i + 2];
    if (cmd == null) break;

    // Subnegotiation: IAC SB ... IAC SE
    if (cmd === TELNET.SB) {
      i += 2;
      while (i < buf.length - 1) {
        if (buf[i] === TELNET.IAC && buf[i + 1] === TELNET.SE) {
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }

    if (opt == null) break;

    // Refuse all options: DO/WILL -> WONT/DONT
    if (cmd === TELNET.DO) replies.push(Buffer.from([TELNET.IAC, TELNET.WONT, opt]));
    else if (cmd === TELNET.WILL) replies.push(Buffer.from([TELNET.IAC, TELNET.DONT, opt]));

    i += 2;
  }

  if (replies.length) {
    try {
      socket.write(Buffer.concat(replies));
    } catch (_) {
      // ignore
    }
  }

  return true;
}

// Helper to strip Telnet IAC sequences from a buffer
function stripTelnetBytes(buf) {
  if (!Buffer.isBuffer(buf)) return buf;
  const result = [];
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] === TELNET.IAC) {
      const cmd = buf[i + 1];
      if (cmd === TELNET.SB) {
        // Skip until IAC SE
        i += 2;
        while (i < buf.length - 1) {
          if (buf[i] === TELNET.IAC && buf[i + 1] === TELNET.SE) {
            i += 1;
            break;
          }
          i += 1;
        }
      } else if (cmd >= TELNET.SE) {
        // 3-byte command: IAC CMD OPT
        i += 2;
      } else {
        // 2-byte command: IAC CMD
        i += 1;
      }
    } else {
      result.push(buf[i]);
    }
  }
  return Buffer.from(result);
}

ipcMain.handle('printer:check-status', async (event, printers) => {
  // IMPORTANT:
  // Background reachability checks must NOT connect to the printer's Telnet port.
  // Some Bestcode devices visibly refresh/flash their UI on *any* TCP connect.
  // Instead, we use ICMP ping (when available) to detect reachability.

  const pingHost = (ipAddress, timeoutMs = 1200) => {
    return new Promise((resolve) => {
      const start = Date.now();

      // Cross-platform ping arguments
      // Windows: ping -n 1 -w <timeout_ms> <host>
      // macOS/Linux: ping -c 1 -W <timeout_s> <host>
      const isWin = process.platform === 'win32';
      const args = isWin
        ? ['-n', '1', '-w', String(timeoutMs), ipAddress]
        : ['-c', '1', '-W', String(Math.max(1, Math.round(timeoutMs / 1000))), ipAddress];

      execFile('ping', args, { timeout: timeoutMs + 500 }, (error) => {
        const responseTime = Date.now() - start;
        // exit code 0 => reachable
        resolve({ ok: !error, responseTime, error: error?.message });
      });
    });
  };

  const results = await Promise.all(
    printers.map(async (printer) => {
      // Prefer ICMP ping (no port connection; avoids printer UI flashing)
      try {
        const ping = await pingHost(printer.ipAddress, 1200);
        if (ping.ok) {
          return {
            id: printer.id,
            isAvailable: true,
            status: 'ready',
            responseTime: ping.responseTime,
          };
        }

        return {
          id: printer.id,
          isAvailable: false,
          status: 'offline',
          error: 'Ping failed',
        };
      } catch (e) {
        return {
          id: printer.id,
          isAvailable: false,
          status: 'offline',
          error: e?.message || 'Ping error',
        };
      }
    })
  );

  return results;
});

ipcMain.handle('printer:connect', async (event, printer) => {
  return new Promise((resolve, reject) => {
    // Persist metadata for on-demand reconnects (e.g. printer closes telnet socket after a command)
    printerMeta.set(printer.id, { ipAddress: printer.ipAddress, port: printer.port });

    // Close existing connection if any
    const existing = connections.get(printer.id);
    // IMPORTANT: Make connect idempotent.
    // The UI has multiple places that can call connect (e.g. NetworkConfig terminal).
    // Some printers will close sockets if we reconnect too aggressively.
    if (existing && !existing.destroyed && existing.writable) {
      console.log(`[printer:connect] Reusing existing socket for ${printer.ipAddress}:${printer.port}`);
      return resolve({ success: true, reused: true });
    }
    if (existing) {
      try {
        existing.destroy();
      } catch (_) {
        // ignore
      }
      connections.delete(printer.id);
    }

    const socket = new net.Socket();
    socket.setTimeout(10000); // Increase timeout
    socket.setKeepAlive(true, 5000); // Enable keep-alive

    let resolved = false;
    let telnetHandshakeComplete = false;
    let handshakeTimer = null;

    const finishConnect = () => {
      if (resolved) return;
      resolved = true;
      clearTimeout(handshakeTimer);
      connections.set(printer.id, socket);
      console.log(`[printer:connect] Connection ready for ${printer.ipAddress}:${printer.port}`);
      resolve({ success: true });
    };

    socket.on('connect', () => {
      console.log(`[printer:connect] TCP connected to ${printer.ipAddress}:${printer.port}`);
      
      // Wait briefly for Telnet negotiation before declaring success
      // This gives the printer time to send IAC sequences
      handshakeTimer = setTimeout(() => {
        if (!telnetHandshakeComplete) {
          console.log(`[printer:connect] No Telnet negotiation received, proceeding`);
        }
        finishConnect();
      }, 300);
    });

    socket.on('timeout', () => {
      console.log(`[printer:connect] Socket timeout for ${printer.id}`);
      // Don't destroy on timeout - just log it
    });

    socket.on('error', (err) => {
      console.error(`[printer:connect] Socket error for ${printer.id}:`, err.message);
      clearTimeout(handshakeTimer);
      connections.delete(printer.id);
      if (!resolved) {
        resolved = true;
        reject({ success: false, error: err.message });
      }
    });

    socket.on('close', (hadError) => {
      console.log(`[printer:connect] Socket closed for ${printer.id}, hadError: ${hadError}`);
      clearTimeout(handshakeTimer);
      connections.delete(printer.id);
      
      if (!resolved) {
        resolved = true;
        reject({ success: false, error: 'Connection closed by printer during handshake' });
      } else {
        // Notify renderer that connection was lost (only if we had successfully connected)
        mainWindow?.webContents.send('printer:connection-lost', { printerId: printer.id });
      }
    });

    socket.on('data', (data) => {
      // Telnet negotiation (respond before logging so logs stay readable)
      const hadTelnet = handleTelnetNegotiation(socket, data);
      if (hadTelnet) {
        telnetHandshakeComplete = true;
        console.log(`[printer:connect] Telnet negotiation handled for ${printer.id}`);
        // Don't return early - printer may send text after IAC sequences
        
        // Strip IAC bytes to see if there's remaining text
        const stripped = stripTelnetBytes(data);
        if (stripped.length > 0) {
          console.log(`[printer:data] ${printer.id}:`, stripped.toString());
        }
        return;
      }
      // Log incoming data for debugging
      console.log(`[printer:data] ${printer.id}:`, data.toString());
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
  const meta = printerMeta.get(printerId);
  const existing = connections.get(printerId);

  // Many telnet-style embedded servers will close the socket after sending a response.
  // To make testing fast/reliable, fall back to an on-demand socket when needed.
  const canUseExisting = !!(existing && !existing.destroyed && existing.writable);

  const getSocket = async () => {
    if (canUseExisting) return { socket: existing, ephemeral: false };
    if (!meta) throw new Error('Printer not connected');

    return await new Promise((resolve, reject) => {
      const socket = new net.Socket();
      socket.setTimeout(5000);
      socket.setKeepAlive(true, 5000);

      socket.once('connect', () => {
        connections.set(printerId, socket);
        resolve({ socket, ephemeral: true });
      });

      socket.once('timeout', () => {
        socket.destroy();
        connections.delete(printerId);
        reject(new Error('Connection timeout'));
      });

      socket.once('error', (err) => {
        socket.destroy();
        connections.delete(printerId);
        reject(err);
      });

      socket.once('close', () => {
        connections.delete(printerId);
        mainWindow?.webContents.send('printer:connection-lost', { printerId });
      });

      socket.connect(meta.port, meta.ipAddress);
    });
  };

  const { socket, ephemeral } = await getSocket();

  return await new Promise((resolve, reject) => {
    let response = '';

    const cleanup = () => {
      socket.off('data', onData);
      socket.off('error', onError);
      socket.off('close', onClose);
      socket.setTimeout(0);
      // If we had to create a new socket just for this send, don't try to keep it alive.
      // (The printer often closes anyway; closing quickly avoids a noisy reconnect loop.)
      if (ephemeral && !socket.destroyed) socket.destroy();
    };

    const finish = () => {
      cleanup();
      resolve({ success: true, response });
    };

    const onError = (err) => {
      cleanup();
      reject({ success: false, error: err.message });
    };

    const onClose = () => {
      // If it closed after we got data, still treat as success.
      // If it closed before any data, surface it.
      if (response.length > 0) finish();
      else {
        cleanup();
        reject({ success: false, error: 'Connection closed by printer' });
      }
    };

    const onData = (chunk) => {
      // Strip/handle telnet negotiation bytes so they don't pollute responses.
      if (handleTelnetNegotiation(socket, chunk)) return;
      response += chunk.toString();
    };

    socket.on('data', onData);
    socket.once('error', onError);
    socket.once('close', onClose);

    // Telnet line endings: many devices require CRLF (\r\n) rather than only CR.
    // Sending only CR can cause the printer to parse the command incorrectly and reply
    // with a generic "not recognized" for otherwise valid commands.
    socket.write(command + '\r\n', (err) => {
      if (err) return onError(err);
      // Give the printer a moment to respond; many responses include a trailing ">" prompt.
      // We purposely keep this short to make iterative testing fast.
      setTimeout(finish, 650);
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
