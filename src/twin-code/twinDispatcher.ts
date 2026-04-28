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

import { setPollingPaused, isPollingPaused, waitForPollingIdle } from '@/lib/pollingPause';
import { printerTransport } from '@/lib/printerTransport';
import { multiPrinterEmulator } from '@/lib/multiPrinterEmulator';
import type { Printer } from '@/types/printer';
import type { TwinPairState } from '@/twin-code/twinPairStore';
import { buildSeedCommands, seedForSide, type MessageSeed } from '@/twin-code/messageSeeds';

const MAX_IN_FLIGHT = 4;
const R_TIMEOUT_MS = 500;
const C_TIMEOUT_MS = 30_000;
/** When one side fails, give the partner this long to settle naturally before forcing abort. */
const PARTNER_GRACE_MS = 50;
/** Synthetic emulator timing — keep small but nonzero so the profiler shows realistic skew. */
const EMU_R_MS = 2;
const EMU_T_MS = 6;
const EMU_C_JITTER_MS = 8; // C lands at ~12-20ms; A vs B drift produces visible skew

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
  private isEmulated = false;

  constructor(
    public printerId: number,
    public label: 'A' | 'B',
    private printer?: Pick<Printer, 'id' | 'ipAddress' | 'port'>,
  ) {}

  /** True when this printerId belongs to the multi-printer dev emulator. */
  private detectEmulated(): boolean {
    try {
      return !!multiPrinterEmulator.getInstanceById(this.printerId);
    } catch { return false; }
  }

  /**
   * Enter 1-1 mode on this printer. If `opts.seed` is provided AND the message
   * named in `opts.messageName` does not yet exist on the printer (per ^LM),
   * the seed is sent first so the dispatcher hot path always has a known-good
   * field shape to write into.
   *
   * Returns `seeded: true` when seeding actually fired (operator-visible).
   */
  async enter(opts: {
    messageName?: string;
    seed?: MessageSeed;
  } = {}): Promise<{ ok: boolean; error?: string; seeded?: boolean }> {
    this.isEmulated = this.detectEmulated();
    const { messageName, seed } = opts;

    // ---- Emulator path: synthesize R/T/C entirely in-process ----
    if (this.isEmulated) {
      // Seed-on-bind is also honored on the emulator so the dev path mirrors prod.
      let seeded = false;
      if (seed && messageName) {
        const r = await this.ensureMessage(messageName, seed);
        if (!r.ok) {
          return { ok: false, error: r.error };
        }
        seeded = !!r.seeded;
      }
      if (messageName) {
        const sm = await printerTransport.sendCommand(this.printerId, `^SM ${messageName}`, { maxWaitMs: 2000 });
        if (!sm?.success) {
          return { ok: false, error: `${this.label}: ^SM failed (emulator)` };
        }
        await printerTransport.sendCommand(this.printerId, '^CM p1', { maxWaitMs: 2000 });
      }
      // Drive ^MB through the regular transport so emulator state stays consistent
      // (oneToOneMode flag flips after the selected message is 1-to-1-ready).
      const mb = await printerTransport.sendCommand(this.printerId, '^MB', { maxWaitMs: 2000 });
      if (!mb?.success || /JNR|jet not running/i.test(mb.response || '')) {
        return { ok: false, error: mb?.error || mb?.response || `${this.label}: ^MB failed (emulator)` };
      }
      this.active = true;
      return { ok: true, seeded };
    }

    if (!window.electronAPI?.oneToOne) {
      // Renderer fallback (no Electron, no emulator) — pretend we entered so demos still work.
      this.active = true;
      return { ok: true };
    }

    if (this.printer) {
      const ready = await printerTransport.connect(this.printer);
      if (!ready?.success) {
        await this.cleanup();
        return { ok: false, error: `${this.label}: connect failed${ready?.error ? ` — ${ready.error}` : ''}` };
      }
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

    const attached = await window.electronAPI.oneToOne.attach(this.printerId);
    if (!attached?.success) {
      await this.cleanup();
      return { ok: false, error: `${this.label}: 1-1 attach failed — no active socket` };
    }

    // Seed-on-bind: if the operator opted in (passed `seed`) and the named
    // message isn't on the printer yet, lay it down before ^SM so the
    // dispatcher's ^MD^BD/^MD^TD path always has a correct field to write to.
    let seeded = false;
    if (seed && messageName) {
      const r = await this.ensureMessage(messageName, seed);
      if (!r.ok) {
        await this.exit();
        return { ok: false, error: r.error };
      }
      seeded = !!r.seeded;
    }

    if (messageName) {
      const sm = await printerTransport.sendCommand(this.printerId, `^SM ${messageName}`, { maxWaitMs: 4000 });
      if (!sm?.success) {
        await this.exit();
        return { ok: false, error: `${this.label}: ^SM failed` };
      }
      const cm = await printerTransport.sendCommand(this.printerId, '^CM p1', { maxWaitMs: 4000 });
      if (!cm?.success) {
        await this.exit();
        return { ok: false, error: `${this.label}: could not set selected message print mode to Auto/1-to-1` };
      }
    }

    const mb = await printerTransport.sendCommand(this.printerId, '^MB', { maxWaitMs: 4000 });
    if (!mb?.success || /JNR|jet not running/i.test(mb.response || '')) {
      await this.cleanup();
      return { ok: false, error: mb?.error || mb?.response || `${this.label}: ^MB failed` };
    }

    const mode = await this.confirmOneToOneMode();
    if (!mode.ok) {
      await this.cleanup();
      return { ok: false, error: mode.error };
    }

    this.active = true;
    return { ok: true, seeded };
  }

  /**
   * Guarantee that `messageName` exists on this printer. Queries ^LM, parses
   * the message list, and only fires the seed sequence when the name is
   * absent. Idempotent and safe to call on every bind.
   *
   * Wire sequence on miss:
   *   ^DM <name>  (defensive — ignored if message doesn't exist)
   *   ^NM <template>;<speed>;<orient>;<mode>;<name>^A<field>...
   *   ^SV         (commit to non-volatile storage)
   *
   * Returns `seeded: false` when the message was already there.
   */
  private async ensureMessage(
    messageName: string,
    seed: MessageSeed,
  ): Promise<{ ok: boolean; error?: string; seeded?: boolean }> {
    const target = messageName.trim().toUpperCase();
    if (!target) return { ok: false, error: `${this.label}: empty message name` };

    // ^LM check — works on both Electron and emulator paths since the regular
    // transport handles routing. If ^LM fails outright, surface the error
    // rather than silently re-seeding (avoids clobbering operator messages
    // when the printer is briefly unresponsive).
    const lm = await printerTransport.sendCommand(this.printerId, '^LM', { maxWaitMs: 4000 });
    if (!lm?.success) {
      return { ok: false, error: `${this.label}: ^LM failed (cannot verify message exists)` };
    }
    const list = lm.response || '';
    // ^LM returns one message name per line (with optional metadata after).
    // Match exact name, case-insensitive, surrounded by line boundaries or whitespace.
    const exists = new RegExp(
      `(^|[\\r\\n\\s])${target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=[\\r\\n\\s]|$)`,
      'i',
    ).test(list);
    if (exists) return { ok: true, seeded: false };

    // Missing → seed. Send sequentially; ^DM is best-effort (ignored if absent).
    const cmds = buildSeedCommands(seed, target);
    const responses: string[] = [];
    for (const cmd of cmds) {
      const r = await printerTransport.sendCommand(this.printerId, cmd, { maxWaitMs: 4000 });
      responses.push(`${cmd.slice(0, 30)} → ${r?.success ? 'ACK' : 'NAK'}${r?.response ? ` "${r.response.trim().slice(0, 80)}"` : ''}`);
      // ^DM may legitimately fail if the message wasn't there — that's expected, not an error.
      if (!r?.success && !cmd.startsWith('^DM')) {
        return {
          ok: false,
          error: `${this.label}: seed cmd "${cmd.slice(0, 40)}..." failed${r?.response ? `: ${r.response.trim()}` : ''}`,
        };
      }
      // Small delay between protocol writes — firmware needs time to commit ^NM before ^SV.
      await new Promise(res => setTimeout(res, 300));
    }

    // VERIFY: re-query ^LM to confirm the message actually persisted. If the
    // firmware silently rejected ^NM (bad field syntax, template mismatch,
    // out-of-range parameter), the previous loop sees ACKs but no message.
    await new Promise(res => setTimeout(res, 500));
    const verify = await printerTransport.sendCommand(this.printerId, '^LM', { maxWaitMs: 4000 });
    const verifyList = verify?.response || '';
    const persisted = new RegExp(
      `(^|[\\r\\n\\s])${target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=[\\r\\n\\s]|$)`,
      'i',
    ).test(verifyList);
    if (!persisted) {
      console.warn('[TwinSeed] verify failed', { target, responses, lmAfter: verifyList });
      return {
        ok: false,
        error: `${this.label}: "${target}" not in ^LM after seed. Wire trace: ${responses.join(' | ')}. ^LM after: "${verifyList.trim().slice(0, 120)}"`,
      };
    }

    console.info('[TwinSeed] seeded & verified', { target, responses });
    return { ok: true, seeded: true };
  }

  /**
   * Issue ^LF on the active message and confirm a field with the given index exists,
   * AND that its type matches `expectedKind` ('text' for ^TD, 'barcode' for ^BD).
   * Per protocol v2.6 §5.28, ^MD only accepts ^TD (text) and ^BD (barcode) targets;
   * a mismatch (e.g. trying ^BD against a graphic field) will be silently dropped
   * by the firmware, which is exactly the failure mode we want to catch on bind.
   * Returns ok=true on success, ok=false on missing field or type mismatch.
   */
  async verifyFieldIndex(
    fieldIndex: number,
    expectedKind: 'text' | 'barcode' = 'text',
  ): Promise<{ ok: boolean; error?: string }> {
    // Skip in renderer-fallback (no transport) and in emulator mode (no real ^LF parity).
    if (!window.electronAPI?.oneToOne || this.isEmulated) return { ok: true };
    const lf = await printerTransport.sendCommand(this.printerId, '^LF', { maxWaitMs: 4000 });
    if (!lf?.success) return { ok: false, error: `${this.label}: ^LF failed` };
    const text = lf.response || '';

    // Try to parse "field N: <type>" pairs first. ^LF formatting varies by firmware
    // revision but typically yields one line per field with a type token like
    // TEXT / BARCODE / DATAMATRIX / QR / GRAPHIC / LOGO.
    const fieldTypes = new Map<number, string>();
    const lineRe = /(?:field|fld)\s*[:#]?\s*(\d+)[^\r\n]*?\b(text|barcode|datamatrix|dm|qr|code\s*128|code\s*39|ean|upc|graphic|logo|bitmap)\b/gi;
    let m: RegExpExecArray | null;
    while ((m = lineRe.exec(text)) !== null) {
      fieldTypes.set(parseInt(m[1], 10), m[2].toLowerCase().replace(/\s+/g, ''));
    }

    // Fallback index discovery (in case the firmware only lists indices, not types).
    const indices = new Set<number>(fieldTypes.keys());
    if (indices.size === 0) {
      const explicit = /(?:field|fld)\s*[:#]?\s*(\d+)/gi;
      while ((m = explicit.exec(text)) !== null) indices.add(parseInt(m[1], 10));
    }
    if (indices.size === 0) {
      const lineCount = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean).length;
      for (let i = 1; i <= lineCount; i++) indices.add(i);
    }

    if (!indices.has(fieldIndex)) {
      return {
        ok: false,
        error: `${this.label}: message has no field index ${fieldIndex} (got [${[...indices].sort((a,b)=>a-b).join(',')}])`,
      };
    }

    // Type check — only enforce when ^LF actually told us the type.
    const actual = fieldTypes.get(fieldIndex);
    if (actual) {
      const isBarcodeType = /^(barcode|datamatrix|dm|qr|code128|code39|ean|upc)$/.test(actual);
      const isTextType = actual === 'text';
      if (expectedKind === 'barcode' && !isBarcodeType) {
        return {
          ok: false,
          error: `${this.label}: field ${fieldIndex} is "${actual}", expected a barcode field for ^MD^BD`,
        };
      }
      if (expectedKind === 'text' && !isTextType) {
        return {
          ok: false,
          error: `${this.label}: field ${fieldIndex} is "${actual}", expected a text field for ^MD^TD`,
        };
      }
    }
    return { ok: true };
  }

  async ensureSeedMessage(messageName: string, seed: MessageSeed): Promise<{ ok: boolean; error?: string; seeded?: boolean }> {
    this.isEmulated = this.detectEmulated();
    if (!this.isEmulated && window.electronAPI && this.printer) {
      const ready = await printerTransport.connect(this.printer);
      if (!ready?.success) {
        return { ok: false, error: `${this.label}: connect failed${ready?.error ? ` — ${ready.error}` : ''}` };
      }
    }
    return this.ensureMessage(messageName, seed);
  }

  private async confirmOneToOneMode(): Promise<{ ok: boolean; error?: string }> {
    const ms = await printerTransport.sendCommand(this.printerId, '^MS', { maxWaitMs: 4000 });
    if (!ms?.success) return { ok: false, error: `${this.label}: ^MS failed after ^MB` };
    const text = (ms.response || '').replace(/\s+/g, ' ').trim();
    if (/\b1\s*-\s*1\s*=\s*ON\b/i.test(text) || /ONETOONE\s+MODE\s*=\s*ON/i.test(text)) {
      return { ok: true };
    }
    return { ok: false, error: `${this.label}: ^MB returned but ^MS did not confirm 1-1=ON (${text.slice(0, 120) || 'empty response'})` };
  }

  async disconnectAfterSeed(): Promise<void> {
    await this.cleanup();
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

    if (this.isEmulated) {
      // Emulator path: poke ^MD through the regular transport (so the emulator
      // logs it and increments product counts), then synthesize R/T/C with a
      // small per-printer jitter so A vs B skew is visible in the profiler.
      printerTransport.sendCommand(this.printerId, mdCommand, { maxWaitMs: 1000 }).catch(() => {});
      const jitter = Math.random() * EMU_C_JITTER_MS;
      setTimeout(() => this.handleAck('R', id), EMU_R_MS);
      setTimeout(() => this.handleAck('T', id), EMU_T_MS + jitter * 0.3);
      setTimeout(() => this.handleAck('C', id), EMU_T_MS + EMU_C_JITTER_MS + jitter);
    } else if (window.electronAPI?.oneToOne) {
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

    if (this.isEmulated) {
      try { await printerTransport.sendCommand(this.printerId, '^ME', { maxWaitMs: 2000 }); } catch (_) { /* best effort */ }
    } else if (window.electronAPI?.oneToOne) {
      try { await printerTransport.sendCommand(this.printerId, '^ME', { maxWaitMs: 4000 }); } catch (_) { /* best effort */ }
      try { await window.electronAPI.oneToOne.detach(this.printerId); } catch (_) { /* best effort */ }
    }
    await this.cleanup();
  }

  private async cleanup() {
    if (this.unsub) { try { this.unsub(); } catch (_) { /* best effort */ } this.unsub = null; }
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
  /** True when the A-side message was auto-seeded during this bind. */
  seededA?: boolean;
  /** True when the B-side message was auto-seeded during this bind. */
  seededB?: boolean;
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
  /** Field index in the message that receives the lid serial (default 1, matches seed). */
  fieldA?: number;
  /** Field index in the message that receives the side serial (default 1, matches seed). */
  fieldB?: number;
  /**
   * Subcommand to use inside ^MD on the A (lid) side.
   * 'BD' = native barcode-data update for DataMatrix / QR / Code128 etc. (v2.6 §5.28.1).
   * 'TD' = text-data update.
   * Default is 'BD' since the lid printer carries the 16x16 DataMatrix in the bonded
   * TwinCode pair. See mem://integration/datamatrix-bd-vs-ng.
   */
  subcommandA?: 'TD' | 'BD';
  /** Subcommand for the B (side) side. Default 'TD' (13-digit human-readable serial). */
  subcommandB?: 'TD' | 'BD';
  /**
   * Optional message to ^SM-select on entry. If both sides should select the
   * same message name, set `messageName`. If A and B run different message
   * names (the customer's typical setup — e.g. "LID" on A, "SIDE" on B), set
   * `messageNameA` and/or `messageNameB` and they take precedence per side.
   * If none are set, whatever message is already active on each printer is used.
   */
  messageName?: string;
  messageNameA?: string;
  messageNameB?: string;
  /** When true, skip the ^LF field-index sanity check on bind (default false). */
  skipFieldCheck?: boolean;
  /**
   * When true, the dispatcher checks ^LM on bind and seeds a canonical
   * LID (DM 16×16) / SIDE (Standard 7×5 text) message if missing.
   * Per-side flags so the operator can opt out per printer when they want
   * to run a hand-built message instead. Default false (back-compat).
   * See `src/twin-code/messageSeeds.ts` for the exact ^NM payloads.
   */
  autoCreateA?: boolean;
  autoCreateB?: boolean;
}

export async function seedTwinPairMessages(
  pair: TwinPairState,
  knownPrinters: Printer[],
  opts: Pick<TwinDispatcherOptions, 'messageNameA' | 'messageNameB' | 'autoCreateA' | 'autoCreateB'>,
): Promise<BoundPairResult> {
  type SeedResult = { ok: boolean; error?: string; seeded?: boolean };
  if (!pair.a || !pair.b) return { ok: false, error: 'Twin pair not configured' };

  const findPrinter = (ip: string, port: number) =>
    knownPrinters.find(p => p.ipAddress === ip && p.port === port);
  const printerA = findPrinter(pair.a.ip, pair.a.port);
  const printerB = findPrinter(pair.b.ip, pair.b.port);
  if (!printerA) return { ok: false, error: `Printer A (${pair.a.ip}) not found in printer list` };
  if (!printerB) return { ok: false, error: `Printer B (${pair.b.ip}) not found in printer list` };

  const wasPaused = isPollingPaused();
  if (!wasPaused) setPollingPaused(true);
  try {
    await Promise.all([printerTransport.setMeta(printerA), printerTransport.setMeta(printerB)]).catch(() => {});
    await waitForPollingIdle(3000);
    const a = new PrinterSession(printerA.id, 'A', printerA);
    const b = new PrinterSession(printerB.id, 'B', printerB);
    try {
      const [resA, resB] = await Promise.all([
        opts.autoCreateA
          ? a.ensureSeedMessage(opts.messageNameA ?? pair.a.messageName ?? 'LID', seedForSide('A'))
          : Promise.resolve<SeedResult>({ ok: true, seeded: false }),
        opts.autoCreateB
          ? b.ensureSeedMessage(opts.messageNameB ?? pair.b.messageName ?? 'SIDE', seedForSide('B'))
          : Promise.resolve<SeedResult>({ ok: true, seeded: false }),
      ]);
      if (!resA.ok || !resB.ok) return { ok: false, error: resA.error || resB.error || 'Message auto-create failed' };
      return { ok: true, aId: printerA.id, bId: printerB.id, seededA: !!resA.seeded, seededB: !!resB.seeded };
    } finally {
      await Promise.all([a.disconnectAfterSeed(), b.disconnectAfterSeed()]);
    }
  } finally {
    if (!wasPaused) setPollingPaused(false);
  }
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

    const printerA = knownPrinters.find(p => p.id === aId);
    const printerB = knownPrinters.find(p => p.id === bId);
    if (!printerA || !printerB) return { ok: false, error: 'Twin pair printer metadata unavailable' };

    await Promise.all([
      printerTransport.setMeta(printerA),
      printerTransport.setMeta(printerB),
    ]).catch(() => {});

    await waitForPollingIdle(3000);

    this.a = new PrinterSession(aId, 'A', printerA);
    this.b = new PrinterSession(bId, 'B', printerB);

    // Enter both in parallel for fastest startup. Per-side message name takes
    // precedence over the shared `messageName` so A and B can run different msgs.
    // Auto-create seed is selected per side; only passed when the operator
    // opted in via `autoCreateA` / `autoCreateB`.
    const msgA = opts.messageNameA ?? pair.a.messageName ?? opts.messageName;
    const msgB = opts.messageNameB ?? pair.b.messageName ?? opts.messageName;
    const [resA, resB] = await Promise.all([
      this.a.enter({ messageName: msgA, seed: opts.autoCreateA ? seedForSide('A') : undefined }),
      this.b.enter({ messageName: msgB, seed: opts.autoCreateB ? seedForSide('B') : undefined }),
    ]);

    if (!resA.ok || !resB.ok) {
      // Clean up whichever entered.
      await Promise.all([this.a.exit(), this.b.exit()]);
      this.a = null; this.b = null;
      if (!this.wasPollingPaused) setPollingPaused(false);
      return { ok: false, error: resA.error || resB.error || 'Pair entry failed' };
    }

    // Field-index sanity check — fail bind early if the active message on either
    // side doesn't expose the configured field index OR if its type doesn't match
    // the chosen ^MD subcommand (^TD requires text, ^BD requires barcode).
    if (!opts.skipFieldCheck) {
      const fieldA = opts.fieldA ?? 2;
      const fieldB = opts.fieldB ?? 2;
      const subA = opts.subcommandA ?? 'BD';
      const subB = opts.subcommandB ?? 'TD';
      const kindA: 'text' | 'barcode' = subA === 'BD' ? 'barcode' : 'text';
      const kindB: 'text' | 'barcode' = subB === 'BD' ? 'barcode' : 'text';
      const [vA, vB] = await Promise.all([
        this.a.verifyFieldIndex(fieldA, kindA),
        this.b.verifyFieldIndex(fieldB, kindB),
      ]);
      if (!vA.ok || !vB.ok) {
        await Promise.all([this.a.exit(), this.b.exit()]);
        this.a = null; this.b = null;
        if (!this.wasPollingPaused) setPollingPaused(false);
        return { ok: false, error: vA.error || vB.error || 'Field-index check failed' };
      }
    }

    return { ok: true, aId, bId, seededA: !!resA.seeded, seededB: !!resB.seeded };
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
    // Default A (lid) → ^BD (native DataMatrix update per v2.6 §5.28.1).
    // Default B (side) → ^TD (text). Both are single short ^MD frames.
    const subA = this.opts.subcommandA ?? 'BD';
    const subB = this.opts.subcommandB ?? 'TD';
    const mdA = `^MD^${subA}${fieldA};${serial}`;
    const mdB = `^MD^${subB}${fieldB};${serial}`;

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

  /**
   * Pre-flight parity check. Fires N back-to-back dispatches at a controlled
   * cadence (sequential, NOT pipelined) and returns aggregate timing + per-side
   * pass/fail. Call BEFORE flipping the conveyor on, to confirm the bonded pair
   * is actually round-tripping R/T/C cleanly on both sides.
   *
   * Each shot writes a deterministic dry-run serial — typically the operator
   * supplies a real catalog seed so the printers physically print scannable
   * codes the operator can verify. Falls back to a numeric placeholder.
   */
  async dryRun(
    count: number,
    seedSerial?: string,
  ): Promise<TwinDryRunResult> {
    if (!this.a || !this.b) {
      return {
        ok: false,
        count: 0,
        passed: 0,
        failed: 0,
        results: [],
        reason: 'not-bound',
      };
    }
    const n = Math.max(1, Math.min(count | 0, 50));
    const results: TwinDispatchResult[] = [];
    // Customer-confirmed payload shape: 13-char uppercase alphanumeric, identical
    // on both printers (e.g. "25X221546754U"). When no real catalog seed is
    // supplied we synthesize a same-shape dry-run serial so the DataMatrix
    // capacity and text-field width are realistic.
    const synthBase = 'DRYRUN'; // 6 chars
    for (let i = 0; i < n; i++) {
      const suffix = String(i + 1).padStart(2, '0');
      const serial = seedSerial
        // Real catalog seed: append a 2-digit run index so each shot is unique
        // (avoids the printer skipping a duplicate as a no-op).
        ? `${seedSerial}${n > 1 ? suffix : ''}`
        // Synthetic: pad to a realistic 13-char shape — "DRYRUN" + 5 digits + 2-digit run idx.
        : `${synthBase}${String(Date.now() % 100000).padStart(5, '0')}${suffix}`;
      results.push(await this.dispatch(serial));
    }

    const okResults = results.filter(r => r.ok);
    const passed = okResults.length;
    const failed = n - passed;
    const aTimes = okResults.map(r => r.aMs).filter((v): v is number => v != null);
    const bTimes = okResults.map(r => r.bMs).filter((v): v is number => v != null);
    const skews  = okResults.map(r => r.skewMs).filter((v): v is number => v != null);
    const cycles = okResults.map(r => r.cycleMs).filter((v): v is number => v != null);
    const stats = (xs: number[]) => xs.length === 0 ? undefined : {
      min: Math.min(...xs),
      max: Math.max(...xs),
      mean: xs.reduce((s, x) => s + x, 0) / xs.length,
    };

    // Aggregate failure reasons per side so the operator sees what to fix.
    const aReasons = [...new Set(results.map(r => r.aReason).filter(Boolean) as string[])];
    const bReasons = [...new Set(results.map(r => r.bReason).filter(Boolean) as string[])];

    return {
      ok: failed === 0,
      count: n,
      passed,
      failed,
      results,
      aStats: stats(aTimes),
      bStats: stats(bTimes),
      skewStats: stats(skews),
      cycleStats: stats(cycles),
      aReasons,
      bReasons,
      reason: failed === 0
        ? undefined
        : `${failed}/${n} failed${aReasons.length ? ` — A:[${aReasons.join('|')}]` : ''}${bReasons.length ? ` B:[${bReasons.join('|')}]` : ''}`,
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

export interface TwinDryRunStats {
  min: number;
  max: number;
  mean: number;
}

export interface TwinDryRunResult {
  ok: boolean;
  count: number;
  passed: number;
  failed: number;
  results: TwinDispatchResult[];
  aStats?: TwinDryRunStats;
  bStats?: TwinDryRunStats;
  skewStats?: TwinDryRunStats;
  cycleStats?: TwinDryRunStats;
  aReasons?: string[];
  bReasons?: string[];
  reason?: string;
}

export const twinDispatcher = new TwinDispatcher();
