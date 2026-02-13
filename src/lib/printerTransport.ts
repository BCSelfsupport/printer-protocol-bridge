/**
 * Transport abstraction for printer communication.
 * 
 * Provides a unified API that works across:
 * 1. Electron (direct TCP via IPC)
 * 2. Relay mode (HTTP via PC's relay server on port 8766)
 * 3. Emulator (development mode)
 * 
 * The relay config is stored in localStorage so it persists across sessions.
 */

const RELAY_STORAGE_KEY = 'relay-config';

export interface RelayConfig {
  pcIp: string;
  port?: number;
}

let relayConfig: RelayConfig | null = null;

// Load on module init
try {
  const stored = localStorage.getItem(RELAY_STORAGE_KEY);
  if (stored) relayConfig = JSON.parse(stored);
} catch {}

export function getRelayConfig(): RelayConfig | null {
  return relayConfig;
}

export function setRelayConfig(config: RelayConfig | null) {
  relayConfig = config;
  if (config) {
    localStorage.setItem(RELAY_STORAGE_KEY, JSON.stringify(config));
  } else {
    localStorage.removeItem(RELAY_STORAGE_KEY);
  }
}

export function isRelayMode(): boolean {
  return !!relayConfig && !window.electronAPI;
}

function getRelayUrl(): string | null {
  if (!relayConfig) return null;
  return `http://${relayConfig.pcIp}:${relayConfig.port || 8766}`;
}

async function relayFetch(endpoint: string, body: any): Promise<any> {
  const base = getRelayUrl();
  if (!base) throw new Error('Relay not configured');
  const res = await fetch(`${base}/relay/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  return res.json();
}

/** Test if the relay server is reachable */
export async function testRelayConnection(config?: RelayConfig): Promise<{ ok: boolean; version?: string; error?: string }> {
  const target = config || relayConfig;
  if (!target) return { ok: false, error: 'No relay configured' };
  const url = `http://${target.pcIp}:${target.port || 8766}/relay/info`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const data = await res.json();
    return data.relay ? { ok: true, version: data.version } : { ok: false, error: 'Not a relay server' };
  } catch (err: any) {
    return { ok: false, error: err.message || 'Cannot reach relay' };
  }
}

// --- Unified transport methods ---

export const printerTransport = {
  async checkStatus(printers: { id: number; ipAddress: string; port: number }[]) {
    if (isRelayMode()) {
      try {
        const data = await relayFetch('check-status', { printers });
        return data.printers || [];
      } catch {
        return printers.map(p => ({ id: p.id, isAvailable: false, status: 'offline' as const }));
      }
    }
    // Electron
    if (window.electronAPI) {
      return window.electronAPI.printer.checkStatus(printers);
    }
    return null; // No transport available
  },

  async connect(printer: { id: number; ipAddress: string; port: number }) {
    if (isRelayMode()) {
      return relayFetch('connect', { printer });
    }
    if (window.electronAPI) {
      return window.electronAPI.printer.connect(printer);
    }
    return { success: false, error: 'No transport available' };
  },

  async disconnect(printerId: number) {
    if (isRelayMode()) {
      return relayFetch('disconnect', { printerId });
    }
    if (window.electronAPI) {
      return window.electronAPI.printer.disconnect(printerId);
    }
    return { success: true };
  },

  async sendCommand(printerId: number, command: string) {
    if (isRelayMode()) {
      return relayFetch('send-command', { printerId, command });
    }
    if (window.electronAPI) {
      return window.electronAPI.printer.sendCommand(printerId, command);
    }
    return { success: false, error: 'No transport available' };
  },

  async setMeta(printer: { id: number; ipAddress: string; port: number }) {
    if (isRelayMode()) {
      // Relay doesn't need meta — connect does the work
      return { success: true };
    }
    if (window.electronAPI) {
      return window.electronAPI.printer.setMeta(printer);
    }
    return { success: true };
  },
};
