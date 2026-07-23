/**
 * Transport abstraction for printer communication.
 *
 * Provides a unified API that works across:
 * 1. Electron (direct TCP via IPC)
 * 2. Relay mode (HTTP via PC's relay server on port 8766)
 * 3. Emulator (development mode)
 *
 * Every sendCommand goes through the command-log ring buffer for post-mortem
 * diagnosis and, in DEV builds, through a tripwire that warns when a write
 * happens during an active save without holding the exclusive write lock.
 *
 * The relay config is stored in localStorage so it persists across sessions.
 */

import { recordCommand } from './printerCommandLog';
import { isSaveBusy } from './saveBusy';
import { isPrinterWriteExclusiveHeld } from './printerWriteQueue';

const RELAY_STORAGE_KEY = 'relay-config';

export interface RelayConfig {
  pcIp: string;
  port?: number;
}

export interface TransportCommandOptions {
  maxWaitMs?: number;
  idleAfterDataMs?: number;
  /** Short caller tag recorded to the command log for post-mortem tracing. */
  caller?: string;
}

let relayConfig: RelayConfig | null = null;

// Load on module init
try {
  const stored = localStorage.getItem(RELAY_STORAGE_KEY);
  if (stored) relayConfig = JSON.parse(stored);
} catch { /* ignore */ }

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

// Default HTTP abort ceiling for a single relay call. Individual commands can
// extend this via options.maxWaitMs (e.g. ^SM on a prompt-before-print message
// or ^NM/^SV saves) — we add a small buffer so the printer's own ACK window
// always expires before the HTTP layer gives up. Clamped to prevent runaway
// waits on truly wedged printers (that scenario should surface as FAIL, not
// hang the fleet loop).
const DEFAULT_RELAY_TIMEOUT_MS = 15000;
const MAX_RELAY_TIMEOUT_MS = 60000;
const RELAY_TIMEOUT_BUFFER_MS = 5000;

function resolveRelayTimeoutMs(body: unknown): number {
  const opts = (body as { options?: TransportCommandOptions } | null)?.options;
  const maxWait = opts?.maxWaitMs;
  if (typeof maxWait === 'number' && maxWait > 0) {
    return Math.min(MAX_RELAY_TIMEOUT_MS, Math.max(DEFAULT_RELAY_TIMEOUT_MS, maxWait + RELAY_TIMEOUT_BUFFER_MS));
  }
  return DEFAULT_RELAY_TIMEOUT_MS;
}

async function relayFetch(endpoint: string, body: unknown): Promise<{ printers?: unknown[]; success?: boolean; response?: string; error?: string; [k: string]: unknown } | null> {
  const base = getRelayUrl();
  if (!base) throw new Error('Relay not configured');
  const res = await fetch(`${base}/relay/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(resolveRelayTimeoutMs(body)),
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
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Cannot reach relay';
    return { ok: false, error: msg };
  }
}

// --- Tripwire: writes that could collide with an in-flight save ---
// Commands that MUTATE printer state (save/select/delete). A non-mutating
// read (^SU, ^VV, ^LM, ^GM, ^LF, ^CN, ^TM, ^TP, ^SD, ^LE, ^S) is far less
// risky during a save digest — but a mutation from an unguarded path is
// exactly what has locked printers up historically.
// ^SJ (jet start/stop) and ^PR (HV on/off) added — a torn-down socket while
// these are in flight has been observed to lock BestCode firmware requiring
// a power-cycle. Any caller MUST hold runPrinterWriteExclusive.
const MUTATING_RE = /^\^(NM|NF|SV|DM|SM|CC|MD|BD|PR|CM|AP|SJ|ME|MB)/i;

function checkTripwire(printerId: number, command: string, caller?: string): { saveBusy: boolean; lockHeld: boolean } {
  const saveBusy = isSaveBusy();
  const lockHeld = isPrinterWriteExclusiveHeld(printerId);
  const isDev = typeof import.meta !== 'undefined' && (import.meta as { env?: { DEV?: boolean } }).env?.DEV;

  if (isDev) {
    if (saveBusy && !lockHeld) {
      // Someone is writing while a save is committing without holding the lock.
      // This is the class of bug that has locked BestCode printers historically.
      console.error(
        `[portGuard] UNSAFE WRITE during saveBusy without exclusive lock — printer=${printerId} cmd="${command}" caller=${caller ?? '?'}`,
        new Error('stack trace').stack,
      );
    } else if (MUTATING_RE.test(command) && !lockHeld) {
      console.warn(
        `[portGuard] Mutating command "${command}" on printer=${printerId} outside exclusive lock (caller=${caller ?? '?'}) — collisions possible if a second writer starts mid-transaction`,
      );
    }
  }

  return { saveBusy, lockHeld };
}

// --- Unified transport methods ---

export const printerTransport = {
  async checkStatus(printers: { id: number; ipAddress: string; port: number }[]) {
    if (isRelayMode()) {
      try {
        const data = await relayFetch('check-status', { printers });
        return data?.printers || [];
      } catch {
        return printers.map((p) => ({ id: p.id, isAvailable: false, status: 'offline' as const }));
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

  async sendCommand(printerId: number, command: string, options?: TransportCommandOptions) {
    const startedAt = Date.now();
    const { saveBusy, lockHeld } = checkTripwire(printerId, command, options?.caller);
    let result: { success: boolean; response?: string; error?: string } | null = null;
    let thrown: unknown = null;

    // ^SV is NOT a real command in BestCode Remote Protocol v2.6. The printer
    // returns "command not recognized" (verified via Dev Panel manual entry).
    // ^NM itself persists messages; ^PW/^DA/^CM/^SB/^GP/^PA are persisted
    // immediately per §5.x. Short-circuit here so we keep all timing/lock
    // scaffolding built around the old ^SV calls without hitting the wire.
    const trimmedForShortCircuit = command.trim().toUpperCase();
    if (trimmedForShortCircuit === '^SV') {
      const durationMs = Date.now() - startedAt;
      recordCommand({
        printerId,
        command,
        startedAt,
        durationMs,
        ok: true,
        response: '[skipped: ^SV not in protocol v2.6]',
        saveBusy,
        lockHeld,
        caller: options?.caller,
      });
      return { success: true, response: '' };
    }

    try {
      if (isRelayMode()) {
        result = await relayFetch('send-command', { printerId, command, options }) as { success: boolean; response?: string; error?: string };
      } else if (window.electronAPI) {
        const send = window.electronAPI.printer.sendCommand as (id: number, cmd: string, opts?: TransportCommandOptions) => Promise<{ success: boolean; response?: string; error?: string }>;
        result = await send(printerId, command, options);
      } else {
        result = { success: false, error: 'No transport available' };
      }
      return result;
    } catch (err) {
      thrown = err;
      throw err;
    } finally {
      const durationMs = Date.now() - startedAt;
      recordCommand({
        printerId,
        command,
        startedAt,
        durationMs,
        ok: !!result?.success && !thrown,
        response: result?.response,
        error: thrown ? String((thrown as Error).message ?? thrown) : result?.error,
        saveBusy,
        lockHeld,
        caller: options?.caller,
      });
    }
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
