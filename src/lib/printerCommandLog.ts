/**
 * Per-printer command ring buffer for post-mortem lockup diagnosis.
 *
 * Every ^-command that leaves the renderer is recorded here with its
 * timestamp, duration, and outcome. When a printer locks up in the field,
 * an operator can run `window.exportPrinterLog(printerId)` (or the export
 * button in the Dev Panel) to hand us the exact command sequence that
 * preceded the lockup — instead of us guessing from console logs that
 * have long since scrolled away.
 *
 * The buffer is bounded (RING_SIZE per printer) so it can run indefinitely
 * on a shop-floor PC without leaking memory.
 */

export interface CommandLogEntry {
  printerId: number;
  command: string;
  startedAt: number;      // epoch ms
  durationMs: number;     // -1 if still in flight
  ok: boolean;
  response?: string;      // truncated
  error?: string;
  saveBusy: boolean;      // was isSaveBusy() true when this started?
  lockHeld: boolean;      // was the exclusive write lock held?
  caller?: string;        // short caller tag
}

const RING_SIZE = 500;
const RESPONSE_TRUNCATE = 200;

const rings = new Map<number, CommandLogEntry[]>();
const listeners = new Set<(entry: CommandLogEntry) => void>();

function push(printerId: number, entry: CommandLogEntry) {
  let ring = rings.get(printerId);
  if (!ring) {
    ring = [];
    rings.set(printerId, ring);
  }
  ring.push(entry);
  if (ring.length > RING_SIZE) ring.splice(0, ring.length - RING_SIZE);
  listeners.forEach((fn) => {
    try { fn(entry); } catch { /* ignore */ }
  });
}

export function recordCommand(entry: CommandLogEntry): void {
  const trimmed: CommandLogEntry = {
    ...entry,
    response: entry.response && entry.response.length > RESPONSE_TRUNCATE
      ? entry.response.slice(0, RESPONSE_TRUNCATE) + '…'
      : entry.response,
  };
  push(entry.printerId, trimmed);
}

export function getCommandLog(printerId: number): CommandLogEntry[] {
  return rings.get(printerId)?.slice() ?? [];
}

export function getAllCommandLogs(): Record<number, CommandLogEntry[]> {
  const out: Record<number, CommandLogEntry[]> = {};
  rings.forEach((v, k) => { out[k] = v.slice(); });
  return out;
}

export function clearCommandLog(printerId?: number): void {
  if (printerId == null) rings.clear();
  else rings.delete(printerId);
}

export function onCommandLogged(fn: (e: CommandLogEntry) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Format a printer's log as a plain-text report for support tickets. */
export function formatCommandLog(printerId: number): string {
  const ring = rings.get(printerId) ?? [];
  const lines = [
    `Printer ${printerId} — last ${ring.length} commands`,
    `Generated: ${new Date().toISOString()}`,
    '='.repeat(80),
  ];
  for (const e of ring) {
    const t = new Date(e.startedAt).toISOString();
    const dur = e.durationMs < 0 ? 'IN-FLIGHT' : `${e.durationMs}ms`;
    const flags = [
      e.ok ? 'OK' : 'FAIL',
      e.saveBusy ? 'saveBusy' : '',
      e.lockHeld ? 'lock' : 'NO-LOCK',
      e.caller ? `by=${e.caller}` : '',
    ].filter(Boolean).join(' ');
    lines.push(`${t}  ${dur.padStart(9)}  ${flags.padEnd(30)}  ${e.command}`);
    if (e.error) lines.push(`    ERROR: ${e.error}`);
    else if (e.response) lines.push(`    -> ${e.response.replace(/\r?\n/g, ' ')}`);
  }
  return lines.join('\n');
}

// Expose to window for one-liner console export in the field.
if (typeof window !== 'undefined') {
  (window as unknown as { exportPrinterLog?: (id: number) => string }).exportPrinterLog = (id: number) => {
    const txt = formatCommandLog(id);
    try {
      const blob = new Blob([txt], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `printer-${id}-commandlog-${Date.now()}.txt`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { /* ignore, still returns string */ }
    return txt;
  };
}
