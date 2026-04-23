/**
 * Twin Code — Live Bonded Dispatcher
 * -----------------------------------
 * Bridges the conveyor simulator's photocell-fire event to the real
 * 1-to-1 print path on a bonded pair (A = lid, B = side).
 *
 * Flow per Print Go:
 *   t0 (PE fires in sim)
 *     → dispatch(serial)
 *     → fan out ^MD to A and B in parallel via oneToOneController
 *     → resolve when BOTH printers report C
 *
 * Lifecycle:
 *   - bind(pair, printers) → resolves twinPairStore IPs to printer IDs,
 *     enters 1-1 on both, returns a dispatcher fn
 *   - unbind() → exits 1-1 on both, restores polling
 *
 * NOTE: oneToOneController is currently a singleton that targets ONE printer.
 * For a true bonded pair we need two parallel controllers — implemented here
 * as two short-lived, ad-hoc instances each owning their own ^MB/^ME lifecycle.
 * The singleton 'oneToOneController' export is kept for single-printer flows;
 * this module spins up dedicated controller instances for A and B.
 */

import { setPollingPaused, isPollingPaused } from '@/lib/pollingPause';
import { printerTransport } from '@/lib/printerTransport';
import type { Printer } from '@/types/printer';
import type { TwinPairState } from '@/twin-code/twinPairStore';

const MAX_IN_FLIGHT = 4;
const R_TIMEOUT_MS = 500;
const C_TIMEOUT_MS = 30_000;
/** When one side fails, give the partner this long to settle naturally before forcing abort. */
const PARTNER_GRACE_MS = 50;

type AckChar = 'R' | 'T' | 'C';

interface InFlight {
  id: number;
  tSent: number;
  tR?: number;
  tT?: number;
  tC?: number;
  resolve: (r: { ok: boolean; rttMs?: number; reason?: string }) => void;
  rTimer: ReturnType<typeof setTimeout>;
  cTimer: ReturnType<typeof setTimeout>;
}

/** Per-printer 1-1 session — independent state machine, independent demuxer subscription. */
class PrinterSession {
  private inFlight: InFlight[] = [];
  private nextId = 1;
  private unsub: (() => void) | null = null;
  private active = false;

  constructor(public printerId: number, public label: 'A' | 'B') {}

  async enter(messageName?: string): Promise<{ ok: boolean; error?: string }> {
    if (!window.electronAPI?.oneToOne) {
      // Renderer fallback (no Electron) — pretend we entered so demos still work.
      this.active = true;
      return { ok: true };
    }

    // Subscribe to ACK stream FIRST so the printer's ^MB response framing is captured.
    this.unsub = window.electronAPI.oneToOne.onAck((payload) => {
      if (payload.printerId !== this.printerId) return;
      if (payload.kind === 'fault') {
        // Drain in-flight as failed; do NOT auto-exit (caller owns lifecycle).
        const drained = [...this.inFlight];
        this.inFlight = [];
        drained.forEach(p => {
          clearTimeout(p.rTimer); clearTimeout(p.cTimer);
          p.resolve({ ok: false, reason: payload.code === 'JET_STOP' ? 'jet-stop' : 'def-off' });
        });
        return;
      }
      if (payload.kind === 'ack' && payload.char) this.handleAck(payload.char);
    });

    await window.electronAPI.oneToOne.attach(this.printerId);

    const mb = await printerTransport.sendCommand(this.printerId, '^MB', { maxWaitMs: 4000 });
    if (!mb?.success || /JNR|jet not running/i.test(mb.response || '')) {
      await this.cleanup();
      return { ok: false, error: mb?.error || mb?.response || `${this.label}: ^MB failed` };
    }

    if (messageName) {
      const sm = await printerTransport.sendCommand(this.printerId, `^SM ${messageName}`, { maxWaitMs: 4000 });
      if (!sm?.success) {
        await this.exit();
        return { ok: false, error: `${this.label}: ^SM failed` };
      }
    }

    this.active = true;
    return { ok: true };
  }

  /**
   * Issue ^LF on the active message and confirm a field with the given index exists.
   * Returns ok=true on success, ok=false if the field is missing or ^LF couldn't be parsed.
   */
  async verifyFieldIndex(fieldIndex: number): Promise<{ ok: boolean; error?: string }> {
    if (!window.electronAPI?.oneToOne) return { ok: true }; // skip in renderer-fallback
    const lf = await printerTransport.sendCommand(this.printerId, '^LF', { maxWaitMs: 4000 });
    if (!lf?.success) return { ok: false, error: `${this.label}: ^LF failed` };
    const text = lf.response || '';
    const explicit = /(?:field|fld)\s*[:#]?\s*(\d+)/gi;
    const indices = new Set<number>();
    let m: RegExpExecArray | null;
    while ((m = explicit.exec(text)) !== null) indices.add(parseInt(m[1], 10));
    if (indices.size === 0) {
      // Fall back to non-empty line count (1-based).
      const lineCount = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean).length;
      for (let i = 1; i <= lineCount; i++) indices.add(i);
    }
    if (!indices.has(fieldIndex)) {
      return { ok: false, error: `${this.label}: message has no field index ${fieldIndex} (got [${[...indices].sort((a,b)=>a-b).join(',')}])` };
    }
    return { ok: true };
  }

  async sendMD(mdCommand: string): Promise<{ ok: boolean; rttMs?: number; reason?: string }> {
    if (!this.active) return { ok: false, reason: 'not-active' };

    // Pace
    while (this.inFlight.length >= MAX_IN_FLIGHT) {
      await new Promise(r => setTimeout(r, 1));
    }

    const id = this.nextId++;
    const tSent = performance.now();
    let resolve!: (r: { ok: boolean; rttMs?: number; reason?: string }) => void;
    const promise = new Promise<{ ok: boolean; rttMs?: number; reason?: string }>(r => { resolve = r; });

    const entry: InFlight = {
      id, tSent, resolve,
      rTimer: setTimeout(() => {
        if (!entry.tR) this.complete(entry, { ok: false, reason: 'timeout-R' });
      }, R_TIMEOUT_MS),
      cTimer: setTimeout(() => {
        if (!entry.tC) this.complete(entry, { ok: false, reason: 'timeout-C' });
      }, C_TIMEOUT_MS),
    };
    this.inFlight.push(entry);

    if (window.electronAPI?.oneToOne) {
      const send = await window.electronAPI.oneToOne.sendMD(this.printerId, mdCommand);
      if (!send.success) this.complete(entry, { ok: false, reason: send.error || 'send-failed' });
    } else {
      // Synthetic ACK fallback so non-Electron demos resolve.
      setTimeout(() => this.handleAck('R', id), 1);
      setTimeout(() => this.handleAck('T', id), 5);
      setTimeout(() => this.handleAck('C', id), 10);
    }

    return promise;
  }

  /**
   * Force-fail every in-flight ^MD as aborted (used when the partner printer
   * has already failed — no point waiting out the 30s C-timeout).
   * Does NOT exit 1-1 mode; the caller still owns the lifecycle.
   */
  abortInFlight(reason = 'partner-failed') {
    const drained = [...this.inFlight];
    this.inFlight = [];
    drained.forEach(p => {
      clearTimeout(p.rTimer); clearTimeout(p.cTimer);
      p.resolve({ ok: false, reason });
    });
  }

  async exit(): Promise<void> {
    this.active = false;
    this.abortInFlight('detached');

    if (window.electronAPI?.oneToOne) {
      try { await printerTransport.sendCommand(this.printerId, '^ME', { maxWaitMs: 4000 }); } catch (_) {}
      try { await window.electronAPI.oneToOne.detach(this.printerId); } catch (_) {}
    }
    await this.cleanup();
  }

  private async cleanup() {
    if (this.unsub) { try { this.unsub(); } catch (_) {} this.unsub = null; }
  }

  private handleAck(char: AckChar, targetId?: number) {
    const entry = targetId != null
      ? this.inFlight.find(e => e.id === targetId)
      : this.inFlight.find(e => {
          if (char === 'R') return !e.tR;
          if (char === 'T') return e.tR && !e.tT;
          if (char === 'C') return !e.tC;
          return false;
        });
    if (!entry) return;
    const now = performance.now();
    if (char === 'R') entry.tR = now;
    if (char === 'T') entry.tT = now;
    if (char === 'C') {
      entry.tC = now;
      this.complete(entry, { ok: true, rttMs: now - entry.tSent });
    }
  }

  private complete(entry: InFlight, result: { ok: boolean; rttMs?: number; reason?: string }) {
    const idx = this.inFlight.indexOf(entry);
    if (idx >= 0) this.inFlight.splice(idx, 1);
    clearTimeout(entry.rTimer); clearTimeout(entry.cTimer);
    entry.resolve(result);
  }
}

// ---------------- Twin pair coordinator ----------------

export interface BoundPairResult {
  ok: boolean;
  error?: string;
  /** Friendly identifiers for logging. */
  aId?: number;
  bId?: number;
}

export interface TwinDispatchResult {
  /** Same serial that was dispatched. */
  serial: string;
  ok: boolean;
  /** Per-printer wire RTT in ms (^MD send → C ACK). */
  aMs?: number;
  bMs?: number;
  /** |aMs - bMs|. */
  skewMs?: number;
  /** max(aMs, bMs). */
  cycleMs?: number;
  /** Combined reason (back-compat for existing consumers). */
  reason?: string;
  /** Per-side failure reasons — undefined when that side succeeded. */
  aReason?: string;
  bReason?: string;
}

export interface TwinDispatcherOptions {
  /** Field index in the message that receives the lid serial (default 2). */
  fieldA?: number;
  /** Field index in the message that receives the side serial (default 2). */
  fieldB?: number;
  /** Optional message to ^SM-select on entry. If omitted, current message is used. */
  messageName?: string;
  /** When true, skip the ^LF field-index sanity check on bind (default false). */
  skipFieldCheck?: boolean;
}

class TwinDispatcher {
  private a: PrinterSession | null = null;
  private b: PrinterSession | null = null;
  private wasPollingPaused = false;
  private opts: TwinDispatcherOptions = {};

  isBound() { return !!(this.a && this.b); }

  /**
   * Resolve twin pair binding → printer IDs in storage → enter 1-1 on both.
   */
  async bind(pair: TwinPairState, knownPrinters: Printer[], opts: TwinDispatcherOptions = {}): Promise<BoundPairResult> {
    if (this.isBound()) return { ok: false, error: 'Already bound' };
    if (!pair.a || !pair.b) return { ok: false, error: 'Twin pair not configured' };

    const findId = (ip: string, port: number) =>
      knownPrinters.find(p => p.ipAddress === ip && p.port === port)?.id;

    const aId = findId(pair.a.ip, pair.a.port);
    const bId = findId(pair.b.ip, pair.b.port);
    if (aId == null) return { ok: false, error: `Printer A (${pair.a.ip}) not found in printer list` };
    if (bId == null) return { ok: false, error: `Printer B (${pair.b.ip}) not found in printer list` };
    if (aId === bId) return { ok: false, error: 'A and B resolve to the same printer' };

    this.opts = opts;

    // Pause polling once for the whole bonded session.
    this.wasPollingPaused = isPollingPaused();
    if (!this.wasPollingPaused) setPollingPaused(true);

    this.a = new PrinterSession(aId, 'A');
    this.b = new PrinterSession(bId, 'B');

    // Enter both in parallel for fastest startup.
    const [resA, resB] = await Promise.all([
      this.a.enter(opts.messageName),
      this.b.enter(opts.messageName),
    ]);

    if (!resA.ok || !resB.ok) {
      // Clean up whichever entered.
      await Promise.all([this.a.exit(), this.b.exit()]);
      this.a = null; this.b = null;
      if (!this.wasPollingPaused) setPollingPaused(false);
      return { ok: false, error: resA.error || resB.error || 'Pair entry failed' };
    }

    // Field-index sanity check — fail bind early if the active message on either
    // side doesn't expose the configured field index. Skippable via opts.
    if (!opts.skipFieldCheck) {
      const fieldA = opts.fieldA ?? 2;
      const fieldB = opts.fieldB ?? 2;
      const [vA, vB] = await Promise.all([
        this.a.verifyFieldIndex(fieldA),
        this.b.verifyFieldIndex(fieldB),
      ]);
      if (!vA.ok || !vB.ok) {
        await Promise.all([this.a.exit(), this.b.exit()]);
        this.a = null; this.b = null;
        if (!this.wasPollingPaused) setPollingPaused(false);
        return { ok: false, error: vA.error || vB.error || 'Field-index check failed' };
      }
    }

    return { ok: true, aId, bId };
  }

  /**
   * Dispatch a single serial to the bonded pair. Resolves when BOTH printers
   * report C (or one fails — in which case the partner is fast-aborted instead
   * of waiting out the C-timeout). Per-side failure reasons are surfaced in
   * `aReason` / `bReason`.
   */
  async dispatch(serial: string): Promise<TwinDispatchResult> {
    if (!this.a || !this.b) return { serial, ok: false, reason: 'not-bound' };

    const a = this.a;
    const b = this.b;
    const fieldA = this.opts.fieldA ?? 2;
    const fieldB = this.opts.fieldB ?? 2;
    const mdA = `^MD^TD${fieldA};${serial}`;
    const mdB = `^MD^TD${fieldB};${serial}`;

    const tStart = performance.now();
    const pA = a.sendMD(mdA);
    const pB = b.sendMD(mdB);

    // Whichever side fails FIRST triggers an abort on the other so we don't
    // sit on a 30s C-timeout waiting for an orphaned partner.
    let aborted = false;
    const watchSide = async (
      p: Promise<{ ok: boolean; rttMs?: number; reason?: string }>,
      partner: PrinterSession,
    ) => {
      const r = await p;
      if (!r.ok && !aborted) {
        aborted = true;
        // Tiny grace so the partner can resolve on its own if it's nearly done.
        setTimeout(() => partner.abortInFlight('partner-failed'), PARTNER_GRACE_MS);
      }
      return r;
    };

    const [rA, rB] = await Promise.all([watchSide(pA, b), watchSide(pB, a)]);
    const tEnd = performance.now();

    const ok = rA.ok && rB.ok;
    const aMs = rA.rttMs;
    const bMs = rB.rttMs;
    const aReason = rA.ok ? undefined : rA.reason;
    const bReason = rB.ok ? undefined : rB.reason;
    return {
      serial,
      ok,
      aMs,
      bMs,
      skewMs: aMs != null && bMs != null ? Math.abs(aMs - bMs) : undefined,
      cycleMs: tEnd - tStart,
      reason: ok ? undefined : [aReason && `A:${aReason}`, bReason && `B:${bReason}`].filter(Boolean).join(' / '),
      aReason,
      bReason,
    };
  }
   * report C (or one fails). Pacing is enforced per-printer; the slower
   * printer is the natural bottleneck.
   */
  async dispatch(serial: string): Promise<TwinDispatchResult> {
    if (!this.a || !this.b) return { serial, ok: false, reason: 'not-bound' };

    const fieldA = this.opts.fieldA ?? 2;
    const fieldB = this.opts.fieldB ?? 2;
    const mdA = `^MD^TD${fieldA};${serial}`;
    const mdB = `^MD^TD${fieldB};${serial}`;

    const tStart = performance.now();
    const [rA, rB] = await Promise.all([this.a.sendMD(mdA), this.b.sendMD(mdB)]);
    const tEnd = performance.now();

    const ok = rA.ok && rB.ok;
    const aMs = rA.rttMs;
    const bMs = rB.rttMs;
    return {
      serial,
      ok,
      aMs,
      bMs,
      skewMs: aMs != null && bMs != null ? Math.abs(aMs - bMs) : undefined,
      cycleMs: tEnd - tStart,
      reason: ok ? undefined : (rA.reason || rB.reason),
    };
  }

  async unbind(): Promise<void> {
    const a = this.a; const b = this.b;
    this.a = null; this.b = null;
    if (a || b) {
      await Promise.all([a?.exit(), b?.exit()]);
    }
    if (!this.wasPollingPaused) setPollingPaused(false);
  }
}

export const twinDispatcher = new TwinDispatcher();
