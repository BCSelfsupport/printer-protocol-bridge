/**
 * One-to-One Print Mode Controller (Protocol v2.6 §6.1)
 * --------------------------------------------------------
 * Drives the high-speed VDP path:
 *   1. Send ^MB to enter 1-1 mode
 *   2. Attach demuxer in Electron main → start receiving R/T/C ACKs + JET STOP / DEF OFF
 *   3. Pause global polling so ^SU/^CN/^TM don't interleave with the ACK stream
 *   4. dispatch(payload) → ^MD^TDx;<data>; pacing capped at 4 in-flight (firmware buffer)
 *   5. Per-print lifecycle: ^MD sent → R (buffered) → T (PE fired) → C (print done)
 *   6. On exit: send ^ME, detach demuxer, resume polling
 *
 * Designed to be transport-agnostic at the call site — the underlying socket
 * work happens in electron/main.cjs. PWA/relay paths are not yet wired (we
 * deliberately fall back to a no-op so the renderer never crashes).
 */

import { setPollingPaused } from './pollingPause';
import { printerTransport } from './printerTransport';

/** Hardware buffer holds 4 messages × 1020 bytes; cap in-flight at 4 to avoid silent drops. */
const MAX_IN_FLIGHT = 4;
/** Recommended target — keep 2-3 in flight for pipelining without bumping the ceiling. */
const TARGET_IN_FLIGHT = 3;
/** If no R within this window, treat ^MD as silently-dropped → caller may retry. */
const R_TIMEOUT_MS = 500;
/** Total per-print lifecycle deadline (R → T → C). PE-bound, so generous. */
const C_TIMEOUT_MS = 30_000;

export interface OneToOneAckPayload {
  printerId: number;
  kind: 'ack' | 'fault';
  char?: 'R' | 'T' | 'C';
  code?: 'JET_STOP' | 'DEF_OFF';
  raw?: string;
  ts: number;
}

export type OneToOneState = 'idle' | 'entering' | 'active' | 'exiting' | 'fault';

export interface InFlightPrint {
  /** Monotonic id (per session). */
  id: number;
  /** Time the ^MD was sent (perf.now ms). */
  tSent: number;
  /** Time R was received. */
  tR?: number;
  /** Time T was received. */
  tT?: number;
  /** Time C was received. */
  tC?: number;
  /** Resolves when the print is acknowledged complete. */
  promise: Promise<OneToOneResult>;
  /** Internal — call to resolve the outer promise. */
  _resolve: (r: OneToOneResult) => void;
}

export interface OneToOneResult {
  id: number;
  ok: boolean;
  /** Reason if !ok: 'timeout-R', 'timeout-C', 'jet-stop', 'def-off', 'detached'. */
  reason?: string;
  rttMs?: number;
}

export interface OneToOneEvents {
  onState?: (s: OneToOneState) => void;
  onAck?: (printId: number, char: 'R' | 'T' | 'C') => void;
  onComplete?: (result: OneToOneResult) => void;
  onFault?: (code: 'JET_STOP' | 'DEF_OFF') => void;
}

class OneToOneController {
  private state: OneToOneState = 'idle';
  private printerId: number | null = null;
  private inFlight: InFlightPrint[] = [];
  private nextId = 1;
  private events: OneToOneEvents = {};
  private unsubscribeAck: (() => void) | null = null;
  /** When the renderer enters 1-1, we stash the prior pause state so resume on exit is a no-op if it was already paused. */
  private wasPollingPaused = false;

  getState() { return this.state; }
  getInFlightCount() { return this.inFlight.length; }
  getCapacity() { return MAX_IN_FLIGHT - this.inFlight.length; }
  getPrinterId() { return this.printerId; }

  setEvents(e: OneToOneEvents) { this.events = e; }

  private setState(s: OneToOneState) {
    if (this.state === s) return;
    this.state = s;
    this.events.onState?.(s);
  }

  /**
   * Enter 1-1 mode for the given printer.
   * Caller must have already selected a message (^SM) — or supply messageName here
   * to do it for them inside the entry sequence.
   */
  async enter(printerId: number, opts?: { messageName?: string }): Promise<{ ok: boolean; error?: string }> {
    if (this.state !== 'idle') {
      return { ok: false, error: `Already in state ${this.state}` };
    }
    this.printerId = printerId;
    this.setState('entering');

    // Pause global polling FIRST so ^MB doesn't race with an in-flight ^SU.
    this.wasPollingPaused = (await import('./pollingPause')).isPollingPaused();
    if (!this.wasPollingPaused) setPollingPaused(true);

    // Subscribe to ACK stream BEFORE sending ^MB so we don't miss the entry response framing.
    this.subscribeAcks();

    // Attach the demuxer in main.
    if (window.electronAPI?.oneToOne) {
      await window.electronAPI.oneToOne.attach(printerId);
    }

    // ^MB — enter 1-1 mode. This DOES still get a normal text response ('OnetoOne Print Mode').
    const mb = await printerTransport.sendCommand(printerId, '^MB', { maxWaitMs: 4000 });
    if (!mb || !mb.success) {
      await this.cleanupAfterFailure();
      return { ok: false, error: mb?.error || 'MB failed' };
    }
    const mbResp = (mb.response || '').trim();
    if (/JNR|jet not running/i.test(mbResp)) {
      await this.cleanupAfterFailure();
      return { ok: false, error: 'Jet not running' };
    }

    // Optionally select message
    if (opts?.messageName) {
      const sm = await printerTransport.sendCommand(printerId, `^SM ${opts.messageName}`, { maxWaitMs: 4000 });
      if (!sm || !sm.success) {
        await this.exit(); // best-effort
        return { ok: false, error: sm?.error || 'SM failed' };
      }
    }

    this.setState('active');
    return { ok: true };
  }

  /**
   * Send a ^MD update and return a promise that resolves when C arrives (or fails).
   * Pacing: if at MAX_IN_FLIGHT, this awaits until a slot frees.
   */
  async dispatch(mdCommand: string): Promise<OneToOneResult> {
    if (this.state !== 'active') {
      return { id: -1, ok: false, reason: 'not-active' };
    }
    if (this.printerId == null) {
      return { id: -1, ok: false, reason: 'no-printer' };
    }

    // Pace — wait for capacity. Simple await loop; fine because R/T/C events drive promise resolution.
    while (this.inFlight.length >= MAX_IN_FLIGHT) {
      await new Promise(r => setTimeout(r, 1));
    }

    const id = this.nextId++;
    const tSent = performance.now();

    let _resolve!: (r: OneToOneResult) => void;
    const promise = new Promise<OneToOneResult>(res => { _resolve = res; });
    const entry: InFlightPrint = { id, tSent, promise, _resolve };
    this.inFlight.push(entry);

    // Per-print deadlines
    const rTimer = setTimeout(() => {
      if (entry.tR) return;
      this.completeInternal(entry, { id, ok: false, reason: 'timeout-R' });
    }, R_TIMEOUT_MS);

    const cTimer = setTimeout(() => {
      if (entry.tC) return;
      this.completeInternal(entry, { id, ok: false, reason: 'timeout-C' });
    }, C_TIMEOUT_MS);

    // Tag the entry so completion can clear timers
    (entry as any)._rTimer = rTimer;
    (entry as any)._cTimer = cTimer;

    // Fire the ^MD on the wire — no response expected (suppressed in 1-1).
    if (window.electronAPI?.oneToOne) {
      const send = await window.electronAPI.oneToOne.sendMD(this.printerId, mdCommand);
      if (!send.success) {
        this.completeInternal(entry, { id, ok: false, reason: send.error || 'send-failed' });
      }
    } else {
      // Fallback for non-Electron environments — emulate immediate R/T/C so callers don't deadlock.
      setTimeout(() => this.handleAck('R', id), 1);
      setTimeout(() => this.handleAck('T', id), 5);
      setTimeout(() => this.handleAck('C', id), 10);
    }

    return promise;
  }

  /**
   * Send ^ME, detach demuxer, resume polling. Always run on shutdown / mode change.
   * REQUIRED — without ^ME the printer loses the most recent message contents.
   */
  async exit(): Promise<{ ok: boolean; error?: string }> {
    if (this.state === 'idle') return { ok: true };
    this.setState('exiting');

    const printerId = this.printerId;

    // Drain in-flight by failing them — caller decided to exit, don't hold them up.
    const drained = [...this.inFlight];
    this.inFlight = [];
    drained.forEach(p => {
      this.clearTimers(p);
      p._resolve({ id: p.id, ok: false, reason: 'detached' });
    });

    let result: { ok: boolean; error?: string } = { ok: true };
    if (printerId != null) {
      const me = await printerTransport.sendCommand(printerId, '^ME', { maxWaitMs: 4000 });
      if (!me?.success) {
        result = { ok: false, error: me?.error || 'ME failed' };
      }
      if (window.electronAPI?.oneToOne) {
        await window.electronAPI.oneToOne.detach(printerId);
      }
    }

    this.unsubscribeAcks();

    // Resume polling unless caller had already paused it before entering.
    if (!this.wasPollingPaused) setPollingPaused(false);

    this.printerId = null;
    this.setState('idle');
    return result;
  }

  // -------------- Internals --------------

  private subscribeAcks() {
    if (this.unsubscribeAck) return;
    if (!window.electronAPI?.oneToOne) return;
    this.unsubscribeAck = window.electronAPI.oneToOne.onAck((payload: OneToOneAckPayload) => {
      if (payload.printerId !== this.printerId) return;
      if (payload.kind === 'fault') {
        this.handleFault(payload.code!);
        return;
      }
      if (payload.kind === 'ack' && payload.char) {
        this.handleAck(payload.char);
      }
    });
  }

  private unsubscribeAcks() {
    if (this.unsubscribeAck) {
      try { this.unsubscribeAck(); } catch (_) {}
      this.unsubscribeAck = null;
    }
  }

  /**
   * Match an incoming R/T/C to the oldest in-flight entry that hasn't yet seen it.
   * Per §6.1 the order is strictly FIFO — R is for the most-recent ^MD that
   * doesn't have an R yet, T/C follow in PE order.
   * Optional `targetId` is used by the in-process fallback path.
   */
  private handleAck(char: 'R' | 'T' | 'C', targetId?: number) {
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
    if (char === 'C') entry.tC = now;

    this.events.onAck?.(entry.id, char);

    if (char === 'C') {
      this.completeInternal(entry, {
        id: entry.id,
        ok: true,
        rttMs: now - entry.tSent,
      });
    }
  }

  private handleFault(code: 'JET_STOP' | 'DEF_OFF') {
    this.events.onFault?.(code);
    if (code === 'JET_STOP') {
      // Per §6.1: 1-1 mode auto-exits on JET STOP. Mirror that locally.
      this.setState('fault');
      // Drain in-flight as failed, then teardown without ^ME (printer already left mode).
      const drained = [...this.inFlight];
      this.inFlight = [];
      drained.forEach(p => {
        this.clearTimers(p);
        p._resolve({ id: p.id, ok: false, reason: 'jet-stop' });
      });
      this.unsubscribeAcks();
      if (this.printerId != null && window.electronAPI?.oneToOne) {
        window.electronAPI.oneToOne.detach(this.printerId).catch(() => {});
      }
      if (!this.wasPollingPaused) setPollingPaused(false);
      this.printerId = null;
      this.setState('idle');
    }
  }

  private completeInternal(entry: InFlightPrint, result: OneToOneResult) {
    const idx = this.inFlight.indexOf(entry);
    if (idx >= 0) this.inFlight.splice(idx, 1);
    this.clearTimers(entry);
    entry._resolve(result);
    this.events.onComplete?.(result);
  }

  private clearTimers(entry: InFlightPrint) {
    const r = (entry as any)._rTimer;
    const c = (entry as any)._cTimer;
    if (r) clearTimeout(r);
    if (c) clearTimeout(c);
  }

  private async cleanupAfterFailure() {
    this.unsubscribeAcks();
    if (this.printerId != null && window.electronAPI?.oneToOne) {
      try { await window.electronAPI.oneToOne.detach(this.printerId); } catch (_) {}
    }
    if (!this.wasPollingPaused) setPollingPaused(false);
    this.printerId = null;
    this.setState('idle');
  }
}

/** Singleton — one 1-1 session at a time across the app. */
export const oneToOneController = new OneToOneController();

export { MAX_IN_FLIGHT, TARGET_IN_FLIGHT };
