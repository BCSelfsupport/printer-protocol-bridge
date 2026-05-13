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
import { buildAutoCodeSeed, buildSeedCommands, seedForSide, type MessageSeed } from '@/twin-code/messageSeeds';

/**
 * Twin Code default print parameters pushed to both printers on bind/seed.
 * Exposed so the production-run audit can record the *exact* values that
 * applied at run time — Width/Speed/Delay have a massive bearing on cycle
 * time and therefore the BPM ceiling, so they belong in the envelope report.
 */
export const TWIN_DEFAULT_WIDTH = 1;
export const TWIN_DEFAULT_DELAY = 100;
export const TWIN_DEFAULT_SPEED_CODE = 3; // ^CM s3 = Ultra Fast
export const TWIN_DEFAULT_SPEED_LABEL = 'Ultra Fast';

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
  onReady?: () => void;
  readyNotified?: boolean;
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
    /**
     * Commands to execute AFTER seed-commit but BEFORE ^SM-select.
     * Use for counter (^CC/^CN) and print parameters (^DA/^PW/^CM) so the
     * very first print after activation uses the intended config — without
     * this, ^SM races and the printer fires one or more bad codes with
     * stale counter values before our follow-up commands catch up.
     */
    preSelectCommands?: string[];
  } = {}): Promise<{ ok: boolean; error?: string; seeded?: boolean }> {
    this.isEmulated = this.detectEmulated();
    const { messageName, seed, preSelectCommands } = opts;

    const runPreSelect = async () => {
      if (!preSelectCommands || preSelectCommands.length === 0) return;
      for (const cmd of preSelectCommands) {
        await printerTransport.sendCommand(this.printerId, cmd, { maxWaitMs: 3000 }).catch(() => {});
      }
      // Persist to non-volatile so the values survive ^SM activation.
      await printerTransport.sendCommand(this.printerId, '^SV', { maxWaitMs: 3000 }).catch(() => {});
      await new Promise(res => setTimeout(res, 150));
    };

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
      await runPreSelect();
      if (messageName) {
        const sm = await printerTransport.sendCommand(this.printerId, `^SM ${messageName}`, { maxWaitMs: 2000 });
        if (!sm?.success) {
          return { ok: false, error: `${this.label}: ^SM failed (emulator)` };
        }
      }
      // Drive ^MB through the regular transport so emulator state stays consistent.
      // Per v2.6 §6.1, ^MB is the 1:1 entry command; ^CM p1 is Auto-Print, not 1:1.
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
      // After ^NM+^SV the firmware needs a beat to commit before ^SM will
      // resolve the new name. Without this, ^SM races the commit and the
      // printer stays on whatever message was previously active.
      if (seeded) await new Promise(res => setTimeout(res, 600));
    }

    if (messageName) {
      const target = messageName.trim().toUpperCase();
      const sm = await printerTransport.sendCommand(this.printerId, `^SM ${target}`, { maxWaitMs: 4000 });
      if (!sm?.success) {
        await this.exit();
        return { ok: false, error: `${this.label}: ^SM failed` };
      }
      // Verify the selection actually took. ^SU is the authoritative status
      // source for the current message; ^MS is only a secondary hint because
      // some firmware revs report 1-1 state there without a message name.
      // If the firmware silently kept the previous selection (common right
      // after a fresh ^NM+^SV) we re-issue ^SM once before giving up.
      await new Promise(res => setTimeout(res, 300));
      const verified = await this.verifyActiveMessage(target);
      if (!verified.ok) {
        // One retry — sometimes ^SM lands but status races it on busy firmware.
        await new Promise(res => setTimeout(res, 400));
        await printerTransport.sendCommand(this.printerId, `^SM ${target}`, { maxWaitMs: 4000 });
        await new Promise(res => setTimeout(res, 300));
        const second = await this.verifyActiveMessage(target);
        if (!second.ok) {
          await this.exit();
          return { ok: false, error: `${this.label}: ^SM ${target} did not stick (active="${second.active || '?'}")` };
        }
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
   * Confirm the active message name when the firmware exposes it. ^SU is the
   * normal source (`Message:` / `MSG:` / `CurMsg[]`). ^MS is a fallback only:
   * protocol v2.6 primarily defines it as 1-1 mode status, and on real units
   * with echo enabled it may return a bare `^MS` line. Echo/status lines must
   * never be treated as the message name.
   */
  private async verifyActiveMessage(target: string): Promise<{ ok: boolean; active?: string }> {
    const expected = target.trim().toUpperCase();

    const clean = (value: string) => value
      .trim()
      .replace(/[>\s]+$/g, '')
      .trim()
      .toUpperCase();

    const parseActive = (raw: string): string => {
      for (const line of raw.split(/[\r\n]+/)) {
        const t = line.trim();
        if (!t) continue;

        const selected = t.match(/\bMessage\s+selected\s*[:=]\s*(\S+)/i);
        if (selected) return clean(selected[1]);

        const named = t.match(/\b(?:Current\s+Message|CurrentMessage|CurMsg|Message|MSG|Msg)\s*[:=]\s*(\S+)/i)
          || t.match(/\b(?:Current\s+Message|CurrentMessage|CurMsg|Message|MSG|Msg)\[\s*([^\]\s>]+)\s*\]/i);
        if (named) return clean(named[1]);
      }

      // Last-resort bare-name fallback: only accept a line that already looks
      // like the expected message, never arbitrary echoes such as `^MS`.
      for (const line of raw.split(/[\r\n]+/)) {
        const t = clean(line);
        if (!t) continue;
        if (t.startsWith('^')) continue;
        if (/^(>|OK|NORM|NORMAL|1\s*-\s*1|ONETOONE|MODE|STATUS|COMMAND|SUCCESS|JET|DEF|ERR|ERROR)/i.test(t)) continue;
        if (/[:=\[\]]/.test(t)) continue;
        if (t === expected || t.endsWith(expected)) return t;
      }

      return '';
    };

    try {
      const su = await printerTransport.sendCommand(this.printerId, '^SU', { maxWaitMs: 4000, idleAfterDataMs: 800 });
      let active = su?.success ? parseActive(su.response || '') : '';
      if (active) return { ok: active === expected || active.endsWith(expected), active };

      const ms = await printerTransport.sendCommand(this.printerId, '^MS', { maxWaitMs: 3000, idleAfterDataMs: 500 });
      active = ms?.success ? parseActive(ms.response || '') : '';
      if (active) return { ok: active === expected || active.endsWith(expected), active };

      // Some firmware simply does not expose current-message state in ^SU/^MS.
      // A successful ^SM followed by field-shape validation is safer than
      // blocking LIVE mode on an inconclusive status response.
      return { ok: true };
    } catch (_) {
      return { ok: true };
    }
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
  /**
   * Build a normalized signature of the seed's fields for content comparison.
   * Extracts ordered field-command kinds (AT/AB/AP/AD/AC/NF) and field count
   * from the seed's ^NM + ^NF lines. Two seeds with the same signature share
   * the same field topology — that's what we compare against the printer's
   * ^LF response to decide whether the on-printer message needs refreshing.
   */
  private seedSignature(seed: MessageSeed): { count: number; kinds: string[] } {
    const kinds: string[] = [];
    for (const cmd of seed.commandsTemplate) {
      // Match every ^Axn occurrence (AT, AB, AP, AD, AC) inside ^NM/^NF lines.
      const re = /\^(A[TBPDC])\d+;/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(cmd)) !== null) kinds.push(m[1].toUpperCase());
    }
    return { count: kinds.length, kinds };
  }

  /**
   * Query ^LF for the currently-selected message and derive a comparable
   * signature (field count + ordered kinds where parseable). ^LF format
   * varies by firmware so we degrade gracefully: if we can't parse types,
   * we still get a count for a coarse mismatch check.
   */
  private async printerSignature(
    messageName: string,
  ): Promise<{ count: number; kinds: string[] } | null> {
    // Select the message first so ^LF reports its fields, not whatever was active.
    const sm = await printerTransport.sendCommand(this.printerId, `^SM ${messageName}`, { maxWaitMs: 4000 });
    if (!sm?.success) return null;
    await new Promise(res => setTimeout(res, 200));
    const lf = await printerTransport.sendCommand(this.printerId, '^LF', { maxWaitMs: 4000 });
    if (!lf?.success) return null;
    const text = (lf.response || '').replace(/^\^LF\s*/i, '');
    const kinds: string[] = [];
    // Try to extract per-field type tokens. Map firmware labels back to the
    // ^Ax command letter we use in seedSignature so the two are comparable.
    const typeMap: Record<string, string> = {
      text: 'AT', barcode: 'AB', datamatrix: 'AB', dm: 'AB', qr: 'AB',
      code128: 'AB', code39: 'AB', ean: 'AB', upc: 'AB',
      programmable: 'AP', programyear: 'AP', programday: 'AP',
      date: 'AD', time: 'AD', julian: 'AD', day: 'AD',
      counter: 'AC', count: 'AC',
    };
    const lineRe = /(?:field|fld)\s*[:#]?\s*(\d+)[^\r\n]*?\b(text|barcode|datamatrix|dm|qr|code\s*128|code\s*39|ean|upc|programmable|program\s*year|program\s*day|date|time|julian|day|counter|count)\b/gi;
    const byIdx = new Map<number, string>();
    let m: RegExpExecArray | null;
    while ((m = lineRe.exec(text)) !== null) {
      const key = m[2].toLowerCase().replace(/\s+/g, '');
      if (typeMap[key]) byIdx.set(parseInt(m[1], 10), typeMap[key]);
    }
    if (byIdx.size > 0) {
      const sorted = [...byIdx.entries()].sort((a, b) => a[0] - b[0]);
      for (const [, k] of sorted) kinds.push(k);
      return { count: kinds.length, kinds };
    }
    // Fallback: count parseable field lines.
    const idx = new Set<number>();
    const idxRe = /(?:field|fld)\s*[:#]?\s*(\d+)/gi;
    while ((m = idxRe.exec(text)) !== null) idx.add(parseInt(m[1], 10));
    if (idx.size === 0) {
      const lineCount = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean).length;
      return { count: lineCount, kinds: [] };
    }
    return { count: idx.size, kinds: [] };
  }

  /** True when the printer's signature is recoverable AND clearly differs from the seed's. */
  private signatureMismatch(
    expected: { count: number; kinds: string[] },
    actual: { count: number; kinds: string[] } | null,
  ): boolean {
    if (this.isEmulated) return false; // emulator ^LF is intentionally simplified
    if (!actual) return false; // can't tell — don't clobber
    if (actual.count !== expected.count) return true;
    if (actual.kinds.length === expected.kinds.length && actual.kinds.length > 0) {
      for (let i = 0; i < expected.kinds.length; i++) {
        if (actual.kinds[i] !== expected.kinds[i]) return true;
      }
    }
    return false;
  }

  private async runSeedCommands(
    target: string,
    seed: MessageSeed,
  ): Promise<{ ok: boolean; error?: string; responses: string[] }> {
    const parked = await this.parkAwayFromTarget(target);
    if (!parked.ok) {
      return {
        ok: false,
        error: `${this.label}: could not deselect "${target}" before re-seed${parked.error ? ` — ${parked.error}` : ''}`,
        responses: parked.responses,
      };
    }

    const cmds = buildSeedCommands(seed, target);
    const responses: string[] = [...parked.responses];
    for (const cmd of cmds) {
      const r = await printerTransport.sendCommand(this.printerId, cmd, { maxWaitMs: 4000 });
      responses.push(`${cmd.slice(0, 30)} → ${r?.success ? 'ACK' : 'NAK'}${r?.response ? ` "${r.response.trim().slice(0, 80)}"` : ''}`);
      if (!r?.success && cmd.startsWith('^DM')) {
        const failure = `${r?.response || ''} ${r?.error || ''}`;
        const harmlessMissing = /MsgNotFnd|Message not found|not found/i.test(failure);
        if (!harmlessMissing) {
          return {
            ok: false,
            error: `${this.label}: delete before seed failed for "${target}"${failure.trim() ? `: ${failure.trim()}` : ''}`,
            responses,
          };
        }
      }
      if (!r?.success && !cmd.startsWith('^DM')) {
        return {
          ok: false,
          error: `${this.label}: seed cmd "${cmd.slice(0, 40)}..." failed${r?.response ? `: ${r.response.trim()}` : ''}`,
          responses,
        };
      }
      await new Promise(res => setTimeout(res, cmd.startsWith('^DM') ? 500 : 300));
    }
    return { ok: true, responses };
  }

  /**
   * Before a seed refresh we must get OFF the target message. BestCode rejects
   * ^DM against the active message; if we ignore that and then send ^NM/^NF,
   * firmware can merge new fields into the old message, which physically prints
   * the new auto-code fields on top of the old 13-character text field.
   */
  private async parkAwayFromTarget(target: string): Promise<{ ok: boolean; error?: string; responses: string[] }> {
    const responses: string[] = [];
    const targetName = target.trim().toUpperCase();
    const parkName = 'TWINPARK';

    const lm = await printerTransport.sendCommand(this.printerId, '^LM', { maxWaitMs: 4000 });
    const names = this.parseMessageNames(lm?.response || '');
    const existingPark = ['BESTCODE', 'QUANTUM', parkName, ...names].find((name) => name !== targetName && names.includes(name));
    let selectedPark = existingPark;

    if (!selectedPark && targetName !== parkName) {
      const nm = await printerTransport.sendCommand(this.printerId, `^NM 1;0;0;0;${parkName}^AT1;0;0;2;P`, { maxWaitMs: 4000 });
      responses.push(`^NM ${parkName} → ${nm?.success ? 'ACK' : 'NAK'}${nm?.response ? ` "${nm.response.trim().slice(0, 80)}"` : ''}`);
      if (!nm?.success) return { ok: false, error: `parking message create failed`, responses };
      await new Promise(res => setTimeout(res, 300));
      const sv = await printerTransport.sendCommand(this.printerId, '^SV', { maxWaitMs: 4000 });
      responses.push(`^SV park → ${sv?.success ? 'ACK' : 'NAK'}${sv?.response ? ` "${sv.response.trim().slice(0, 80)}"` : ''}`);
      if (!sv?.success) return { ok: false, error: `parking message save failed`, responses };
      await new Promise(res => setTimeout(res, 500));
      selectedPark = parkName;
    }

    if (!selectedPark) return { ok: true, responses };
    const sm = await printerTransport.sendCommand(this.printerId, `^SM ${selectedPark}`, { maxWaitMs: 4000 });
    responses.push(`^SM ${selectedPark} → ${sm?.success ? 'ACK' : 'NAK'}${sm?.response ? ` "${sm.response.trim().slice(0, 80)}"` : ''}`);
    if (!sm?.success) return { ok: false, error: `parking select failed`, responses };
    await new Promise(res => setTimeout(res, 400));
    return { ok: true, responses };
  }

  private parseMessageNames(raw: string): string[] {
    const stop = new Set(['COMMAND', 'SUCCESSFUL', 'MESSAGE', 'MESSAGES', 'LIST', 'CREATED', 'SELECTED', 'OK']);
    return [...new Set(
      raw
        .toUpperCase()
        .split(/[\s,;:\r\n]+/)
        .map((part) => part.replace(/[^A-Z0-9_-]/g, ''))
        .filter((part) => part.length > 0 && part.length <= 32 && /[A-Z]/.test(part) && !stop.has(part)),
    )];
  }

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
    const exists = new RegExp(
      `(^|[\\r\\n\\s])${target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=[\\r\\n\\s]|$)`,
      'i',
    ).test(list);

    const expectedSig = this.seedSignature(seed);

    if (exists) {
      // Compare on-printer field topology against the seed. If they don't
      // match (e.g. the printer still has an old single-field LID but we now
      // want the 5-field auto-code), delete + recreate so both printers run
      // exactly the message the bind dialog asked for.
      const actualSig = await this.printerSignature(target);
      if (!this.signatureMismatch(expectedSig, actualSig)) {
        return { ok: true, seeded: false };
      }
      console.info('[TwinSeed] content mismatch — refreshing', { target, expected: expectedSig, actual: actualSig });
    }

    // Missing OR mismatched → seed (the seed's first ^DM handles overwrite).
    const seedRun = await this.runSeedCommands(target, seed);
    if (!seedRun.ok) return { ok: false, error: seedRun.error };
    const responses = seedRun.responses;

    // VERIFY: re-query ^LM to confirm the message actually persisted.
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

    const seededSig = await this.printerSignature(target);
    if (this.signatureMismatch(expectedSig, seededSig)) {
      console.warn('[TwinSeed] post-seed signature mismatch', { target, expected: expectedSig, actual: seededSig, responses });
      return {
        ok: false,
        error: `${this.label}: "${target}" still has the wrong field layout after re-seed. Wire trace: ${responses.join(' | ')}`,
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

  async sendMD(
    mdCommand: string,
    opts: { onReady?: () => void } = {},
  ): Promise<{ ok: boolean; rttMs?: number; reason?: string }> {
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
      onReady: opts.onReady,
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

  forcePrintGo() {
    const cmd = '^PT';
    if (this.isEmulated) {
      printerTransport.sendCommand(this.printerId, cmd, { maxWaitMs: 1000 }).catch(() => {});
      return;
    }

    // Bench/pre-flight needs the same signal the operator is manually pressing:
    // ^PT = Print Go / Force Print. In 1-1 mode send it as a raw socket write so
    // T/C ACKs remain owned by the ACK demuxer, not the normal command reader.
    if (window.electronAPI?.oneToOne) {
      window.electronAPI.oneToOne.sendMD(this.printerId, cmd).catch(() => {});
      return;
    }

    printerTransport.sendCommand(this.printerId, cmd, { maxWaitMs: 1000 }).catch(() => {});
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
    if (char === 'R') {
      entry.tR = now;
      if (entry.onReady && !entry.readyNotified) {
        entry.readyNotified = true;
        entry.onReady();
      }
    }
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

export interface TwinDispatchOptions {
  forceTrigger?: boolean;
  /**
   * Auto-Code Mode: SIDE printer auto-counts natively, so we MUST NOT push
   * ^MD to B (would overwrite a static text field). Only LID gets the ^MD^BD
   * push so its DataMatrix encodes the same serial. B just gets a Print Go.
   */
  autoCode?: boolean;
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
  /** Auto-Code Mode seed/config supplied by the saved twin-pair binding. */
  autoCodeMode?: boolean;
  autoCodeOpts?: TwinPairState['autoCodeOpts'];
}

export async function seedTwinPairMessages(
  pair: TwinPairState,
  knownPrinters: Printer[],
  opts: Pick<TwinDispatcherOptions, 'messageNameA' | 'messageNameB' | 'autoCreateA' | 'autoCreateB'> & {
    /** Optional seed override for side A — replaces the default LID seed. */
    seedA?: MessageSeed;
    /** Optional seed override for side B — replaces the default SIDE seed. */
    seedB?: MessageSeed;
    /**
     * Optional hardware-counter configuration to push to BOTH printers via the
     * named-parameter ^CC form (protocol v2.6 §5.5) plus a ^CN reset to load
     * the start value into the live counter. Lets the operator re-zero or
     * re-seed mid-run after rejects without touching either HMI.
     * See mem://integration/cc-named-parameters.
     */
    counterConfig?: {
      slot: 1 | 2 | 3 | 4;
      start: number;
      digits: number;
      leadingZero: boolean;
    };
  },
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
      const nameA = opts.messageNameA ?? pair.a.messageName ?? 'LID';
      const nameB = opts.messageNameB ?? pair.b.messageName ?? 'SIDE';
      const seedAUsed = opts.seedA ?? seedForSide('A');
      const seedBUsed = opts.seedB ?? seedForSide('B');
      const [resA, resB] = await Promise.all([
        opts.autoCreateA
          ? a.ensureSeedMessage(nameA, seedAUsed)
          : Promise.resolve<SeedResult>({ ok: true, seeded: false }),
        opts.autoCreateB
          ? b.ensureSeedMessage(nameB, seedBUsed)
          : Promise.resolve<SeedResult>({ ok: true, seeded: false }),
      ]);
      if (!resA.ok || !resB.ok) return { ok: false, error: resA.error || resB.error || 'Message auto-create failed' };

      // Give freshly-seeded ^NM/^SV a beat to commit before any follow-on cmds.
      if (resA.seeded || resB.seeded) await new Promise(res => setTimeout(res, 600));

      // CRITICAL ORDER: push print params + counter config BEFORE ^SM-select.
      // If we ^SM-select first, the printer activates the message with stale
      // counter values (e.g. last operator setting) and prints one or more bad
      // codes before the ^CC/^CN we send catches up. Pre-loading these while
      // the message is still inactive guarantees the very first print uses the
      // intended counter start/digits/leading-zero config.
      // ^DA = print delay, ^PW = print width, ^CM s = speed. Defaults baseline
      // for minimum cycle time; operator can tune up via Adjust if needed.
      // ^CC named-parameter form per protocol v2.6 §5.5
      // (mem://integration/cc-named-parameters). Positional form silently
      // swaps L and E — always use I/S/E/L/T explicitly.
      for (const pid of [printerA.id, printerB.id]) {
        await printerTransport.sendCommand(pid, `^DA ${TWIN_DEFAULT_DELAY}`, { maxWaitMs: 3000 }).catch(() => {});
        await printerTransport.sendCommand(pid, `^PW ${TWIN_DEFAULT_WIDTH}`, { maxWaitMs: 3000 }).catch(() => {});
        await printerTransport.sendCommand(pid, `^CM s${TWIN_DEFAULT_SPEED_CODE}`, { maxWaitMs: 3000 }).catch(() => {});

        if (opts.counterConfig) {
          const { slot, start, digits, leadingZero } = opts.counterConfig;
          const end = Math.max(start, Math.pow(10, Math.max(1, digits)) - 1);
          await printerTransport.sendCommand(pid, `^CC ${slot};I1`, { maxWaitMs: 3000 }).catch(() => {});
          await printerTransport.sendCommand(pid, `^CC ${slot};S${start}`, { maxWaitMs: 3000 }).catch(() => {});
          await printerTransport.sendCommand(pid, `^CC ${slot};E${end}`, { maxWaitMs: 3000 }).catch(() => {});
          await printerTransport.sendCommand(pid, `^CC ${slot};L${leadingZero ? 1 : 0}`, { maxWaitMs: 3000 }).catch(() => {});
          await printerTransport.sendCommand(pid, `^CC ${slot};T0`, { maxWaitMs: 3000 }).catch(() => {});
          await printerTransport.sendCommand(pid, `^CN ${slot};${start}`, { maxWaitMs: 3000 }).catch(() => {});
          await new Promise(res => setTimeout(res, 150));
        }

        await new Promise(res => setTimeout(res, 200));
        await printerTransport.sendCommand(pid, '^SV', { maxWaitMs: 3000 }).catch(() => {});
        await new Promise(res => setTimeout(res, 150));
      }

      // Now ^SM-select the bound LID/SIDE messages — counters and print
      // parameters are already loaded so the first cycle prints the right code.
      const selA = await printerTransport.sendCommand(printerA.id, `^SM ${nameA.trim().toUpperCase()}`, { maxWaitMs: 4000 });
      const selB = await printerTransport.sendCommand(printerB.id, `^SM ${nameB.trim().toUpperCase()}`, { maxWaitMs: 4000 });
      if (!selA?.success || !selB?.success) {
        return {
          ok: false,
          error: `Message ^SM-select failed${!selA?.success ? ` on A (${nameA})` : ''}${!selB?.success ? ` on B (${nameB})` : ''}`,
        };
      }

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
   * Returns the per-side ^MD subcommand kinds for the currently bound pair, so
   * UI consumers (e.g. pre-flight) can pick realistic latency budgets. A side
   * doing native ^BD (DataMatrix encoding) costs ~100ms more firmware-side
   * than a plain ^TD text update.
   */
  getBoundProfile(): { subA: 'TD' | 'BD'; subB: 'TD' | 'BD'; hasBarcode: boolean } | null {
    if (!this.isBound()) return null;
    const subA = this.opts.subcommandA ?? 'BD';
    const subB = this.opts.subcommandB ?? 'TD';
    return { subA, subB, hasBarcode: subA === 'BD' || subB === 'BD' };
  }

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
    const autoCodeSeedA = opts.autoCodeMode && opts.autoCodeOpts ? buildAutoCodeSeed(opts.autoCodeOpts, 'A') : seedForSide('A');
    const autoCodeSeedB = opts.autoCodeMode && opts.autoCodeOpts ? buildAutoCodeSeed(opts.autoCodeOpts, 'B') : seedForSide('B');
    const [resA, resB] = await Promise.all([
      this.a.enter({ messageName: msgA, seed: opts.autoCreateA ? autoCodeSeedA : undefined }),
      this.b.enter({ messageName: msgB, seed: opts.autoCreateB ? autoCodeSeedB : undefined }),
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
      const fieldA = opts.fieldA ?? 1;
      const fieldB = opts.fieldB ?? 1;
      const subA = opts.subcommandA ?? 'BD';
      const subB = opts.subcommandB ?? 'TD';
      const kindA: 'text' | 'barcode' = subA === 'BD' ? 'barcode' : 'text';
      const kindB: 'text' | 'barcode' = opts.autoCodeMode ? 'text' : (subB === 'BD' ? 'barcode' : 'text');
      const [vA, vB] = await Promise.all([
        this.a.verifyFieldIndex(fieldA, kindA),
        this.b.verifyFieldIndex(opts.autoCodeMode ? 5 : fieldB, kindB),
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
  async dispatch(serial: string, opts?: TwinDispatchOptions): Promise<TwinDispatchResult> {
    if (!this.a || !this.b) return { serial, ok: false, reason: 'not-bound' };

    const a = this.a;
    const b = this.b;
    const fieldA = this.opts.fieldA ?? 1;
    const fieldB = this.opts.fieldB ?? 1;
    // Default A (lid) → ^BD (native DataMatrix update per v2.6 §5.28.1).
    // Default B (side) → ^TD (text). Both are single short ^MD frames.
    const subA = this.opts.subcommandA ?? 'BD';
    const subB = this.opts.subcommandB ?? 'TD';
    const mdA = `^MD^${subA}${fieldA};${serial}`;
    const mdB = `^MD^${subB}${fieldB};${serial}`;
    const autoCode = !!opts?.autoCode;

    const tStart = performance.now();
    let aReady = false;
    let bReady = autoCode; // No ^MD on B in autoCode — treat B as ready immediately.
    let forceSent = false;
    // CRITICAL: in Auto-Code mode the SIDE printer self-prints natively from
    // the shared hardware photocell (no ^MD needed). If we ALSO inject ^PT
    // via forcePrintGo, the printer fires twice per bottle and we get the
    // characteristic ghost/overlay print where one serial sits on top of
    // the next. Suppress all host-side Print Go in autoCode — the photocell
    // is the single source of truth for bottle timing.
    const allowForce = !!opts?.forceTrigger && !autoCode;
    const fireWhenReady = () => {
      if (!allowForce || forceSent || !aReady || !bReady) return;
      forceSent = true;
      a.forcePrintGo();
      b.forcePrintGo();
    };

    const pA = a.sendMD(mdA, { onReady: () => { aReady = true; fireWhenReady(); } });
    // In autoCode, skip the ^MD push on B (printer auto-counts via ^AC slot).
    // Synthesize a successful side-B result so the bonded result aggregator
    // doesn't fault out and so the conveyor still records a clean print.
    const pB: Promise<{ ok: boolean; rttMs?: number; reason?: string }> = autoCode
      ? Promise.resolve({ ok: true, rttMs: 0 })
      : b.sendMD(mdB, { onReady: () => { bReady = true; fireWhenReady(); } });

    // Pre-flight / bench path: no product crosses the photocell, so send the
    // same Print Go (^PT) signal the operator would otherwise press manually.
    // If an R ACK is missed, a later fallback raw ^PT still gives the firmware
    // a chance to advance T→C before C-timeout. Skipped in autoCode (see above).
    if (allowForce) {
      setTimeout(() => {
        if (forceSent) return;
        forceSent = true;
        a.forcePrintGo();
        b.forcePrintGo();
      }, 250);
    }

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
      results.push(await this.dispatch(serial, { forceTrigger: true }));
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

  /** Currently bound printer IDs, or null when not bound. */
  getBoundIds(): { aId: number; bId: number } | null {
    if (!this.a || !this.b) return null;
    return { aId: this.a.printerId, bId: this.b.printerId };
  }

  /**
   * Query the live Width / Delay actually programmed on each printer right now.
   * Operators tune ^DA (and sometimes ^PW) on the line after bind to nail the
   * print position relative to the photocell — what they end up at is the value
   * that will dominate cycle time in real production, so the report needs the
   * AS-RUN values, not just the AS-BOUND defaults.
   *
   * Speed (^CM s) is intentionally NOT re-queried: bind locked it to Ultra Fast
   * and there's no read-only ^CM query that returns the speed code reliably
   * across firmware revs. The bind-time value is authoritative for it.
   *
   * Best-effort: any side that fails to respond simply yields nulls — the
   * report falls back to the bind defaults for that side. Never throws.
   */
  async fetchLivePrintParams(): Promise<{
    a: { widthDots: number | null; delayDots: number | null };
    b: { widthDots: number | null; delayDots: number | null };
  } | null> {
    if (!this.a || !this.b) return null;
    const parseInt1 = (raw: string | undefined, key: 'PW' | 'DA'): number | null => {
      if (!raw) return null;
      // Tolerant patterns: "PW: 1", "Print Width: 1", "DA: 100", "Delay: 100".
      const patterns = key === 'PW'
        ? [/Print\s*Width\s*[:=]\s*(\d+)/i, /\bPW\s*[:=]\s*(\d+)/i, /\b(\d+)\b/]
        : [/Delay\s*(?:Adjust)?\s*[:=]\s*(\d+)/i, /\bDA\s*[:=]\s*(\d+)/i, /\b(\d+)\b/];
      for (const p of patterns) {
        const m = raw.match(p);
        if (m) return parseInt(m[1], 10);
      }
      return null;
    };
    const querySide = async (pid: number) => {
      const pw = await printerTransport.sendCommand(pid, '^PW', { maxWaitMs: 2000 }).catch(() => null);
      const da = await printerTransport.sendCommand(pid, '^DA', { maxWaitMs: 2000 }).catch(() => null);
      return {
        widthDots: pw?.success ? parseInt1(pw.response, 'PW') : null,
        delayDots: da?.success ? parseInt1(da.response, 'DA') : null,
      };
    };
    try {
      const [a, b] = await Promise.all([querySide(this.a.printerId), querySide(this.b.printerId)]);
      return { a, b };
    } catch {
      return null;
    }
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
