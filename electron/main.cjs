const { app, BrowserWindow, ipcMain, globalShortcut } = require('electron');
const net = require('net');
const http = require('http');
const os = require('os');
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');

// Log file for debugging auto-updater in packaged builds
const logFile = path.join(app.getPath('userData'), 'codesync-updater.log');
function logToFile(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try { fs.appendFileSync(logFile, line); } catch (_) {}
  console.log(msg);
}

let mainWindow;

// Handler for Escape key to exit fullscreen
function handleFullscreenEscape(event, input) {
  if (input.key === 'Escape' && mainWindow && mainWindow.isFullScreen()) {
    mainWindow.setFullScreen(false);
  }
}

// Dev/prod detection
// - When running locally via `npx electron ...`, NODE_ENV is often undefined.
// - `app.isPackaged` is the most reliable signal.
const isDev = !app.isPackaged || process.env.NODE_ENV === 'development';

// Auto-updater (optional)
let autoUpdater;
logToFile(`[init] isDev=${!app.isPackaged ? 'true' : 'false'}, isPackaged=${app.isPackaged}, version=${app.getVersion()}`);
logToFile(`[init] userData=${app.getPath('userData')}`);
if (!isDev && app.isPackaged) {
  try {
    ({ autoUpdater } = require('electron-updater'));
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.logger = { info: (m) => logToFile(`[updater-info] ${m}`), warn: (m) => logToFile(`[updater-warn] ${m}`), error: (m) => logToFile(`[updater-error] ${m}`), debug: (m) => logToFile(`[updater-debug] ${m}`) };
    logToFile('[init] electron-updater loaded successfully');
  } catch (e) {
    logToFile(`[init] electron-updater NOT available: ${e.message}`);
  }
} else {
  logToFile('[init] Skipping auto-updater (dev mode)');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    fullscreen: true,
    frame: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, '../public/codesync-icon.png'),
  });

  // Escape exits kiosk-style fullscreen → normal windowed mode with frame
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'Escape' && mainWindow.isFullScreen()) {
      mainWindow.setFullScreen(false);
      // Re-create window with frame to restore title bar & taskbar
      const bounds = mainWindow.getBounds();
      const newWin = new BrowserWindow({
        ...bounds,
        frame: true,
        autoHideMenuBar: false,
        fullscreen: false,
        webPreferences: {
          preload: path.join(__dirname, 'preload.cjs'),
          contextIsolation: true,
          nodeIntegration: false,
        },
        icon: path.join(__dirname, '../public/codesync-icon.png'),
      });
      newWin.loadURL(mainWindow.webContents.getURL());
      mainWindow.destroy();
      mainWindow = newWin;

      // Re-register DevTools shortcut on new window
      mainWindow.webContents.on('before-input-event', (event, input) => {
        if (input.control && input.shift && input.key === 'I') {
          mainWindow.webContents.toggleDevTools();
        }
      });
    }
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
    logToFile(`[ready-to-show] isDev=${isDev}, isPackaged=${app.isPackaged}, version=${app.getVersion()}`);
    logToFile(`[ready-to-show] autoUpdater available: ${!!autoUpdater}`);
    if (autoUpdater) {
      logToFile('[ready-to-show] Calling checkForUpdates...');
      autoUpdater.checkForUpdates()
        .then((result) => logToFile(`[ready-to-show] Check result: ${JSON.stringify(result)}`))
        .catch((err) => logToFile(`[ready-to-show] Check error: ${err.message}`));
    }

    // Allow Ctrl+Shift+I to open DevTools in packaged builds
    mainWindow.webContents.on('before-input-event', (event, input) => {
      if (input.control && input.shift && input.key === 'I') {
        mainWindow.webContents.toggleDevTools();
      }
    });
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

  const pingHost = (ipAddress, timeoutMs = 2500) => {
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
        const ping = await pingHost(printer.ipAddress, 2500);
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

    // Telnet negotiation listener — only active during handshake phase.
    // Once handshake is done this listener is removed so it doesn't interfere
    // with sendCommandToSocket's own data handler (which also handles telnet).
    const onConnectData = (data) => {
      const hadTelnet = handleTelnetNegotiation(socket, data);
      if (hadTelnet) {
        telnetHandshakeComplete = true;
        console.log(`[printer:connect] Telnet negotiation handled for ${printer.id}`);
      }
      // Log any non-telnet text for debugging
      const stripped = stripTelnetBytes(data);
      if (stripped && stripped.length > 0) {
        console.log(`[printer:data] ${printer.id}:`, stripped.toString());
      }
    };
    socket.on('data', onConnectData);

    const finishConnect = () => {
      if (resolved) return;
      resolved = true;
      clearTimeout(handshakeTimer);
      // Remove the connect-phase data listener so it doesn't double-handle
      // telnet bytes during subsequent sendCommand calls.
      socket.off('data', onConnectData);
      connections.set(printer.id, socket);
      console.log(`[printer:connect] Connection ready for ${printer.ipAddress}:${printer.port}`);
      resolve({ success: true });
    };

    socket.on('connect', () => {
      console.log(`[printer:connect] TCP connected to ${printer.ipAddress}:${printer.port}`);
      
      // Wait for Telnet negotiation before declaring success.
      // Model 88 and similar printers need a longer handshake phase (1200ms)
      // before they'll accept commands on the socket.
      handshakeTimer = setTimeout(() => {
        if (!telnetHandshakeComplete) {
          console.log(`[printer:connect] No Telnet negotiation received after 1200ms, proceeding`);
        }
        finishConnect();
      }, 1200);
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
        resolve({ success: false, error: err.message });
      }
    });

    socket.on('close', (hadError) => {
      console.log(`[printer:connect] Socket closed for ${printer.id}, hadError: ${hadError}`);
      clearTimeout(handshakeTimer);
      connections.delete(printer.id);
      
      if (!resolved) {
        resolved = true;
        resolve({ success: false, error: 'Connection closed by printer during handshake' });
      } else {
        // Notify renderer that connection was lost (only if we had successfully connected)
        mainWindow?.webContents.send('printer:connection-lost', { printerId: printer.id });
      }
    });

    socket.connect(printer.port, printer.ipAddress);
  });
});

// Allow the renderer to register printer connection metadata without opening a TCP socket.
// This enables on-demand command sockets (send-command) without causing the printer UI to flash
// from an immediate Telnet connect.
ipcMain.handle('printer:set-meta', async (event, printer) => {
  printerMeta.set(printer.id, { ipAddress: printer.ipAddress, port: printer.port });
  return { success: true };
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
  try {
    return await sendCommandToSocket(printerId, command);
  } catch (err) {
    return { success: false, error: err.message || 'Command failed' };
  }
});

// Cache update state so renderer can query it after mount (avoids race condition)
let cachedUpdateState = { stage: 'idle', info: null, progress: null };

if (autoUpdater) {
  autoUpdater.on('checking-for-update', () => {
    logToFile('[event] Checking for update...');
  });

  autoUpdater.on('update-available', (info) => {
    logToFile(`[event] Update available: ${JSON.stringify(info)}`);
    cachedUpdateState = { stage: 'downloading', info, progress: null };
    mainWindow?.webContents.send('update-available', info);
  });

  autoUpdater.on('update-not-available', (info) => {
    logToFile(`[event] No update available. Current: ${app.getVersion()}, Latest: ${info?.version}`);
  });

  autoUpdater.on('download-progress', (progress) => {
    logToFile(`[event] Download progress: ${Math.round(progress.percent)}%`);
    const progressData = {
      percent: progress.percent,
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total,
    };
    cachedUpdateState.progress = progressData;
    mainWindow?.webContents.send('update-download-progress', progressData);
  });

  autoUpdater.on('update-downloaded', (info) => {
    logToFile(`[event] Update downloaded: ${JSON.stringify(info)}`);
    cachedUpdateState = { stage: 'ready', info, progress: null };
    mainWindow?.webContents.send('update-downloaded', info);
  });

  autoUpdater.on('error', (err) => {
    logToFile(`[event] Error: ${err.message}\n${err.stack}`);
  });
}

// Let the renderer query cached update state on mount
ipcMain.handle('app:get-update-state', () => cachedUpdateState);

// Expose updater log file to renderer for diagnostics
ipcMain.handle('app:get-updater-log', () => {
  try {
    const content = fs.readFileSync(logFile, 'utf8');
    // Return last 100 lines
    const lines = content.split('\n');
    return lines.slice(-100).join('\n');
  } catch (_) {
    return '(no log file found)';
  }
});


ipcMain.handle('app:check-for-updates', () => {
  autoUpdater?.checkForUpdatesAndNotify?.();
});

ipcMain.handle('app:install-update', () => {
  autoUpdater?.quitAndInstall?.();
});

ipcMain.handle('app:get-version', () => {
  return app.getVersion();
});

ipcMain.handle('app:toggle-fullscreen', () => {
  if (mainWindow) {
    mainWindow.setFullScreen(!mainWindow.isFullScreen());
  }
  return { fullscreen: mainWindow?.isFullScreen() ?? false };
});

ipcMain.handle('app:is-fullscreen', () => {
  return mainWindow?.isFullScreen() ?? false;
});

// --- Mobile Relay HTTP Server ---
// Exposes a simple JSON API on port 8766 so mobile PWA clients on the same WiFi
// can relay printer commands through this Electron app.
const RELAY_PORT = 8766;
let relayServer = null;

function getLocalIPs() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push(iface.address);
      }
    }
  }
  return ips;
}

function startRelayServer() {
  relayServer = http.createServer(async (req, res) => {
    // CORS headers for mobile PWA
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Health / info endpoint
    if (req.method === 'GET' && req.url === '/relay/info') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ relay: true, version: app.getVersion(), ips: getLocalIPs() }));
      return;
    }

    // All other routes are POST /relay/<action>
    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Method not allowed' }));
      return;
    }

    // Parse body
    let body = '';
    for await (const chunk of req) body += chunk;
    let payload;
    try { payload = JSON.parse(body); } catch { 
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
      return;
    }

    const sendJson = (status, data) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    };

    try {
      const url = req.url;

      if (url === '/relay/check-status') {
        // Reuse the same ping logic as printer:check-status
        const printers = payload.printers || [];
        const pingHost = (ipAddress, timeoutMs = 2500) => {
          return new Promise((resolve) => {
            const isWin = process.platform === 'win32';
            const args = isWin
              ? ['-n', '1', '-w', String(timeoutMs), ipAddress]
              : ['-c', '1', '-W', String(Math.max(1, Math.round(timeoutMs / 1000))), ipAddress];
            execFile('ping', args, { timeout: timeoutMs + 500 }, (error) => {
              resolve({ ok: !error });
            });
          });
        };
        const results = await Promise.all(printers.map(async (p) => {
          const ping = await pingHost(p.ipAddress, 2500);
          return { id: p.id, isAvailable: ping.ok, status: ping.ok ? 'ready' : 'offline' };
        }));
        sendJson(200, { printers: results });

      } else if (url === '/relay/connect') {
        // Store meta + connect socket
        const printer = payload.printer;
        printerMeta.set(printer.id, { ipAddress: printer.ipAddress, port: printer.port });
        // Attempt TCP connect
        const result = await new Promise((resolve) => {
          const existing = connections.get(printer.id);
          if (existing && !existing.destroyed && existing.writable) {
            return resolve({ success: true, reused: true });
          }
          if (existing) { try { existing.destroy(); } catch(_) {} connections.delete(printer.id); }

          const socket = new net.Socket();
          socket.setTimeout(10000);
          socket.setKeepAlive(true, 5000);
          let resolved = false;

          socket.on('connect', () => {
            if (!resolved) { resolved = true; connections.set(printer.id, socket); resolve({ success: true }); }
          });
          socket.on('error', (err) => {
            if (!resolved) { resolved = true; resolve({ success: false, error: err.message }); }
          });
          socket.on('close', () => { connections.delete(printer.id); });
          socket.on('data', (data) => { handleTelnetNegotiation(socket, data); });
          socket.connect(printer.port, printer.ipAddress);

          setTimeout(() => { if (!resolved) { resolved = true; socket.destroy(); resolve({ success: false, error: 'Timeout' }); } }, 10000);
        });
        sendJson(200, result);

      } else if (url === '/relay/disconnect') {
        const { printerId } = payload;
        const socket = connections.get(printerId);
        if (socket) { socket.destroy(); connections.delete(printerId); }
        sendJson(200, { success: true });

      } else if (url === '/relay/send-command') {
        const { printerId, command } = payload;
        // Reuse the existing send-command logic by invoking it programmatically
        try {
          const result = await sendCommandToSocket(printerId, command);
          sendJson(200, result);
        } catch (err) {
          sendJson(200, { success: false, error: err.message || 'Command failed' });
        }

      } else {
        sendJson(404, { error: 'Unknown relay endpoint' });
      }
    } catch (err) {
      sendJson(500, { error: err.message || 'Internal error' });
    }
  });

  relayServer.listen(RELAY_PORT, '0.0.0.0', () => {
    const ips = getLocalIPs();
    logToFile(`[relay] Server listening on port ${RELAY_PORT}`);
    logToFile(`[relay] Local IPs: ${ips.join(', ')}`);
    // Notify renderer of relay info
    mainWindow?.webContents.send('relay:info', { port: RELAY_PORT, ips });
  });

  relayServer.on('error', (err) => {
    logToFile(`[relay] Server error: ${err.message}`);
  });
}

// Per-printer command queue to prevent concurrent socket writes.
// When two callers (e.g. connect burst + polling) send commands at the same time,
// the onData handlers collide and responses get lost → timeouts.
const commandQueues = new Map(); // printerId → Promise chain

async function sendCommandToSocket(printerId, command) {
  // Queue this command behind any in-flight command for the same printer
  const prev = commandQueues.get(printerId) || Promise.resolve();
  const current = prev.then(
    () => _sendCommandToSocketImpl(printerId, command),
    () => _sendCommandToSocketImpl(printerId, command), // continue even if prev failed
  );
  commandQueues.set(printerId, current.catch(() => {})); // swallow so chain never rejects
  return current;
}

// Extract send-command logic into a reusable function for both IPC and relay
async function _sendCommandToSocketImpl(printerId, command) {
  const meta = printerMeta.get(printerId);
  const existing = connections.get(printerId);

  // More aggressive liveness check: also verify the socket hasn't errored
  const canUseExisting = !!(existing && !existing.destroyed && existing.writable && !existing.pending);

  console.log(`[sendCommand] printer=${printerId} cmd="${command}" hasExisting=${!!existing} canReuse=${canUseExisting} hasMeta=${!!meta}`);

  const getSocket = async () => {
    if (canUseExisting) {
      console.log(`[sendCommand] Reusing persistent socket for printer ${printerId}`);
      return { socket: existing, ephemeral: false };
    }

    // Clean up dead socket
    if (existing) {
      console.log(`[sendCommand] Destroying dead socket for printer ${printerId}`);
      try { existing.destroy(); } catch (_) {}
      connections.delete(printerId);
    }

    if (!meta) throw new Error('Printer not connected (no meta)');

    console.log(`[sendCommand] Creating ephemeral socket to ${meta.ipAddress}:${meta.port}`);

    return await new Promise((resolve, reject) => {
      const socket = new net.Socket();
      socket.setTimeout(8000);
      socket.setKeepAlive(true, 5000);

      socket.once('connect', () => {
        console.log(`[sendCommand] Ephemeral TCP connected to ${meta.ipAddress}:${meta.port}, waiting for Telnet handshake...`);

        // Wait for Telnet negotiation to complete BEFORE resolving.
        // Model 88 and other older printers need this handshake phase.
        let handshakeData = false;
        const onHandshakeData = (data) => {
          const hadTelnet = handleTelnetNegotiation(socket, data);
          if (hadTelnet) {
            handshakeData = true;
            console.log(`[sendCommand] Telnet negotiation handled on ephemeral socket`);
          }
          // Also log any text payload received during handshake
          const stripped = stripTelnetBytes(data);
          if (stripped && stripped.length > 0) {
            console.log(`[sendCommand] Handshake text: "${stripped.toString().substring(0, 200)}"`);
          }
        };
        socket.on('data', onHandshakeData);

        // Give printer up to 1200ms to send Telnet negotiation.
        // Must match the persistent connect handshake time — Model 88 (v01.09)
        // and other firmware versions can be slow to complete negotiation.
        setTimeout(() => {
          socket.off('data', onHandshakeData);
          connections.set(printerId, socket);
          console.log(`[sendCommand] Handshake phase done (gotTelnet=${handshakeData}), ready to send command`);
          resolve({ socket, ephemeral: true });
        }, 1200);
      });

      socket.once('timeout', () => {
        console.log(`[sendCommand] Ephemeral socket timeout for printer ${printerId}`);
        socket.destroy();
        connections.delete(printerId);
        reject(new Error('Connection timeout'));
      });
      socket.once('error', (err) => {
        console.error(`[sendCommand] Ephemeral socket error for printer ${printerId}:`, err.message);
        socket.destroy();
        connections.delete(printerId);
        reject(err);
      });
      socket.once('close', () => { connections.delete(printerId); });
      socket.connect(meta.port, meta.ipAddress);
    });
  };

  const { socket, ephemeral } = await getSocket();

  return await new Promise((resolve, reject) => {
    let response = '';
    const MAX_WAIT_MS = 8000;
    const IDLE_AFTER_DATA_MS = 600; // 600ms idle = response done
    let maxTimer = null;
    let idleTimer = null;
    let gotAnyData = false;
    let finished = false;

    const cleanup = () => {
      if (finished) return;
      finished = true;
      socket.off('data', onData);
      socket.off('error', onError);
      socket.off('close', onClose);
      socket.setTimeout(0);
      if (maxTimer) clearTimeout(maxTimer);
      if (idleTimer) clearTimeout(idleTimer);
      if (ephemeral && !socket.destroyed) {
        console.log(`[sendCommand] Destroying ephemeral socket after command "${command}"`);
        socket.destroy();
      }
    };

    const finish = () => {
      if (finished) return;
      console.log(`[sendCommand] cmd="${command}" DONE, responseLen=${response.length}, response="${response.substring(0, 300)}"`);
      cleanup();
      resolve({ success: true, response });
    };

    const scheduleFinishWhenIdle = () => {
      if (finished) return;
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => finish(), IDLE_AFTER_DATA_MS);
    };

    const onError = (err) => {
      if (finished) return;
      console.error(`[sendCommand] Socket error during cmd="${command}":`, err.message);
      cleanup();
      if (!ephemeral) connections.delete(printerId);
      reject(new Error(err.message));
    };

    const onClose = () => {
      if (finished) return;
      console.log(`[sendCommand] Socket closed during cmd="${command}", responseLen=${response.length}`);
      if (!ephemeral) connections.delete(printerId);
      if (response.length > 0) finish();
      else { cleanup(); reject(new Error('Connection closed by printer')); }
    };

    const onData = (chunk) => {
      if (finished) return;
      console.log(`[sendCommand] cmd="${command}" DATA chunk (${chunk.length} bytes): hex=${chunk.toString('hex').substring(0, 120)}`);

      const hadTelnet = handleTelnetNegotiation(socket, chunk);
      let text;
      if (hadTelnet) {
        const stripped = stripTelnetBytes(chunk);
        text = (stripped && stripped.length > 0) ? stripped.toString() : '';
      } else {
        text = chunk.toString();
      }

      if (!text) { scheduleFinishWhenIdle(); return; }

      response += text;
      gotAnyData = true;
      console.log(`[sendCommand] cmd="${command}" accumulated (${response.length} chars): "${text.substring(0, 200)}"`);

      // '>' at end of response = printer's CLI prompt signalling it's done.
      // Only treat it as terminal when it's the last non-whitespace character.
      const trimmed = response.trimEnd();
      if (trimmed.length > 3 && trimmed[trimmed.length - 1] === '>') {
        console.log(`[sendCommand] cmd="${command}" trailing '>' detected, finishing`);
        finish();
        return;
      }

      scheduleFinishWhenIdle();
    };

    socket.on('data', onData);
    socket.once('error', onError);
    socket.once('close', onClose);

    maxTimer = setTimeout(() => {
      if (finished) return;
      console.log(`[sendCommand] cmd="${command}" MAX_WAIT timeout (${MAX_WAIT_MS}ms), gotData=${gotAnyData}, responseLen=${response.length}`);
      if (gotAnyData) finish();
      else {
        if (!ephemeral) {
          console.log(`[sendCommand] Destroying dead persistent socket for printer ${printerId}`);
          try { socket.destroy(); } catch (_) {}
          connections.delete(printerId);
        }
        cleanup();
        reject(new Error('No response from printer (timeout)'));
      }
    }, MAX_WAIT_MS);

    console.log(`[sendCommand] Writing "${command}\\r\\n" to socket...`);
    socket.write(command + '\r\n', (err) => {
      if (err) {
        console.error(`[sendCommand] Write error for cmd="${command}":`, err.message);
        return onError(err);
      }
      console.log(`[sendCommand] Write OK for cmd="${command}"`);
    });
  });
}

// IPC handler for relay info
ipcMain.handle('relay:get-info', () => {
  return { port: RELAY_PORT, ips: getLocalIPs() };
});

app.whenReady().then(() => {
  createWindow();
  startRelayServer();
});

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
