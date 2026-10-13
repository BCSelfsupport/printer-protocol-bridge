/**
 * Live-printer validation steps for TwinCode.
 *
 * Test data is generated from the 1 Oct 2026 Track-n-Trace → DataJet log
 * (old Domino A400 line): the exact Config frame, the Print-message layout
 * (Rule 3, Part 001, Line 07, Year A) and the bridge behaviour (2 codes queued,
 * advance only when both printers confirm).
 *
 * These steps DO print on the bound printers (that's the point), but they never
 * touch the serial catalog, ledger, or production run, and they refuse to start
 * while a production run or photocell mirror is active.
 */
import { twinDispatcher, type TwinDispatchResult } from "../twinDispatcher";
import { twinPairStore } from "../twinPairStore";
import type { Printer } from "@/types/printer";
import { productionRun } from "../productionRun";
import { TwinPairQueue, mapConfigToPrinters, validatePrintedCode, SERIAL_MAX, type PrinterSlot } from "../tntLineRunner";
import { encodeFrame, FrameDecoder, MSG, parseConfig, parsePrint, encodeLastSerial, toHex, type ParsedPrint } from "./tntCodecBrowser";

/** Exact Config frame body captured in the log at 09:07:39 (P1 normal, P2 inverted+reversed). */
export const LOG_CONFIG = "2001000800000003000000000800000003000006";
/** Test serials sit in a reserved high range so they can never be confused with production codes. */
export const TEST_SERIAL_START = 900001;

export function julianToday(d = new Date()): string {
  const start = Date.UTC(d.getUTCFullYear(), 0, 0);
  return String(Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - start) / 86400000)).padStart(3, "0");
}

export function buildTestPrintMessage(startSerial: number, line = "07", year = "A", julian = julianToday()): string {
  return `3001${line}${year}${julian}${String(startSerial).padStart(6, "0")}U`;
}

export interface LiveLogEntry { t: string; dir: string; text: string; hex?: string }
export interface LiveStepResult { ok: boolean; detail: string; data?: unknown }

const now = () => new Date().toISOString().slice(11, 23);

export function safetyCheck(): LiveStepResult {
  const problems: string[] = [];
  if (productionRun.getState().active) problems.push("a production run is active — stop it first");
  if (twinDispatcher.getPhotocellMirrorState().active) problems.push("the line (photocell mirror) is running — stop it first");
  return problems.length ? { ok: false, detail: problems.join("; ") } : { ok: true, detail: "No production run or live line active — safe to send test codes." };
}

/** True when this validation session opened the live link itself (so it closes it again). */
let validationOwnsLink = false;

/** Close the live link if (and only if) validation opened it. */
export async function releaseValidationLink(): Promise<void> {
  if (validationOwnsLink && twinDispatcher.isBound()) await twinDispatcher.unbind().catch(() => {});
  validationOwnsLink = false;
}

export async function connectionCheck(printers: Printer[] = []): Promise<LiveStepResult> {
  if (!twinDispatcher.isBound()) {
    const pair = twinPairStore.getState();
    if (!pair.a || !pair.b) return { ok: false, detail: "No bound pair. Press Bind Pair, choose both printers, then retry." };
    // Pair is saved but the live link isn't open (production not started) — open it for testing only.
    const res = await twinDispatcher.bind(pair, printers, {
      messageNameA: pair.a.messageName, messageNameB: pair.b.messageName,
      fieldA: pair.a.fieldIndex, fieldB: pair.b.fieldIndex,
      subcommandA: pair.a.subcommand, subcommandB: pair.b.subcommand,
      autoCreateA: pair.a.autoCreate ?? true, autoCreateB: pair.b.autoCreate ?? true,
      autoCodeMode: false,
    });
    if (!res.ok) return { ok: false, detail: `Pair is bound but the live link could not open: ${res.error ?? "unknown error"}` };
    validationOwnsLink = true;
  }
  const ids = twinDispatcher.getBoundIds();
  const params = await twinDispatcher.fetchLivePrintParams().catch(() => null);
  if (!params) return { ok: false, detail: "Pair is bound but printers did not answer." };
  const okA = params.a.widthDots != null || params.a.delayDots != null;
  const okB = params.b.widthDots != null || params.b.delayDots != null;
  if (!okA || !okB) return { ok: false, detail: `No reply from ${!okA ? "Printer 1 (lid)" : ""}${!okA && !okB ? " and " : ""}${!okB ? "Printer 2 (side)" : ""}.`, data: params };
  return {
    ok: true,
    detail: `Both printers answered (IDs ${ids?.aId}/${ids?.bId}). P1 width ${params.a.widthDots ?? "?"} delay ${params.a.delayDots ?? "?"} · P2 width ${params.b.widthDots ?? "?"} delay ${params.b.delayDots ?? "?"}.`,
    data: params,
  };
}

export async function sendSingle(code: string, log: (e: LiveLogEntry) => void): Promise<LiveStepResult> {
  const v = validatePrintedCode(code);
  if ("error" in v) return { ok: false, detail: v.error };
  log({ t: now(), dir: "CodeSync→P1+P2", text: code });
  const r = await twinDispatcher.dispatch(code, { forceTrigger: true });
  log({ t: now(), dir: "P1+P2→CodeSync", text: r.ok ? `ACK both · A ${r.aMs?.toFixed(0)}ms B ${r.bMs?.toFixed(0)}ms` : `FAIL ${r.reason}` });
  return r.ok
    ? { ok: true, detail: `Sent ${code} · P1 ${r.aMs?.toFixed(0)} ms · P2 ${r.bMs?.toFixed(0)} ms · skew ${r.skewMs?.toFixed(0)} ms`, data: r }
    : { ok: false, detail: `Send failed: ${r.reason}`, data: r };
}

/** Send N consecutive codes to both printers, one after another, logging each transmit. */
export async function sendBatch(codes: string[], log: (e: LiveLogEntry) => void, onSent?: (index: number, code: string, ok: boolean) => void): Promise<LiveStepResult> {
  const sent: string[] = []; const failed: { code: string; reason: string }[] = [];
  for (let i = 0; i < codes.length; i++) {
    const r = await sendSingle(codes[i], log);
    onSent?.(i, codes[i], r.ok);
    if (r.ok) sent.push(codes[i]); else { failed.push({ code: codes[i], reason: r.detail }); break; }
  }
  return failed.length
    ? { ok: false, detail: `Stopped at code ${failed[0].code}: ${failed[0].reason} (${sent.length}/${codes.length} sent)`, data: { sent, failed } }
    : { ok: true, detail: `${sent.length} codes transmitted to both printers`, data: { sent, failed } };
}

export interface LiveRunSummary {
  configFlags: ReturnType<typeof mapConfigToPrinters>;
  printed: string[]; failures: { code: string; reason: string }[];
  cycleP50: number; cycleP95: number; skewP95: number; bpm: number; lastSerialReply: string;
}

const pct = (xs: number[], p: number) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]; };

/**
 * Full replay: simulated Track-n-Trace sends the log's Config + a test Print
 * message over our framing, the bridge decodes them, and the two-code queue
 * drives the REAL bound printers. Stops on the first failure (pair must stay
 * in lockstep — no code is ever skipped).
 */
export async function runLiveReplay(opts: {
  startSerial: number; bottles: number; gapMs: number;
  log: (e: LiveLogEntry) => void; onProgress: (done: number, total: number) => void; signal?: AbortSignal;
}): Promise<LiveStepResult & { summary?: LiveRunSummary }> {
  const { log } = opts;
  const dec = new FrameDecoder();

  // 1. Config
  const cfgFrame = encodeFrame(MSG.CONFIG, LOG_CONFIG);
  log({ t: now(), dir: "T&T(sim)→Bridge", text: "CONFIG", hex: toHex(cfgFrame) });
  const cfg = parseConfig(dec.push(cfgFrame)[0].body!);
  if ("error" in cfg) return { ok: false, detail: cfg.error };
  const flags = mapConfigToPrinters(cfg);
  log({ t: now(), dir: "Bridge", text: `P1 ${JSON.stringify(flags.printer1)} · P2 ${JSON.stringify(flags.printer2)}` });

  // 2. Print
  const printBody = buildTestPrintMessage(opts.startSerial);
  const prFrame = encodeFrame(MSG.PRINT, printBody);
  log({ t: now(), dir: "T&T(sim)→Bridge", text: `PRINT ${printBody}`, hex: toHex(prFrame) });
  const pp = parsePrint(dec.push(prFrame)[0].body!);
  if ("error" in pp) return { ok: false, detail: pp.error };
  const p = pp as ParsedPrint;

  // 3. Queue → live printers
  const printed: string[] = []; const failures: { code: string; reason: string }[] = [];
  const cycles: number[] = []; const skews: number[] = [];
  const q = new TwinPairQueue((slot, code) => log({ t: now(), dir: `Bridge→P${slot} queue`, text: code }), (_s, code) => printed.push(code));
  q.start({ prodLine: p.prodLine, alphaYear: p.alphaYear, julian: p.julian }, p.serialValue);
  const t0 = performance.now();
  while (printed.length < opts.bottles) {
    if (opts.signal?.aborted) { log({ t: now(), dir: "Operator", text: "Stopped" }); break; }
    const head = q.queued[0];
    const r: TwinDispatchResult = await twinDispatcher.dispatch(head.code, { forceTrigger: true });
    if (!r.aReason) q.confirm(1 as PrinterSlot, head.serial);
    if (!r.bReason) q.confirm(2 as PrinterSlot, head.serial);
    if (!r.ok) {
      failures.push({ code: head.code, reason: r.reason ?? "unknown" });
      log({ t: now(), dir: "Bridge", text: `HOLD ${head.code} — ${r.reason}. Waiting on P${q.waitingOn ?? "1+2"}; nothing skipped.` });
      break;
    }
    if (r.cycleMs != null) cycles.push(r.cycleMs);
    if (r.skewMs != null) skews.push(r.skewMs);
    log({ t: now(), dir: "P1+P2→Bridge", text: `confirmed ${head.code} (${r.cycleMs?.toFixed(0)} ms)` });
    opts.onProgress(printed.length, opts.bottles);
    if (opts.gapMs > 0) await new Promise((res) => setTimeout(res, opts.gapMs));
  }
  const elapsed = (performance.now() - t0) / 60000;

  // 4. 30-s poll equivalent
  const reply = encodeLastSerial(q.lastSerial);
  log({ t: now(), dir: "T&T(sim)→Bridge", text: "REQUEST 01" });
  log({ t: now(), dir: "Bridge→T&T(sim)", text: `LAST SERIAL ${q.lastSerial}`, hex: toHex(reply) });

  const dupes = printed.length - new Set(printed).size;
  const summary: LiveRunSummary = {
    configFlags: flags, printed, failures,
    cycleP50: pct(cycles, 50), cycleP95: pct(cycles, 95), skewP95: pct(skews, 95),
    bpm: elapsed > 0 ? printed.length / elapsed : 0, lastSerialReply: toHex(reply),
  };
  const ok = failures.length === 0 && dupes === 0 && printed.length === opts.bottles;
  return {
    ok, summary,
    detail: ok
      ? `${printed.length} codes printed on both printers · cycle p95 ${summary.cycleP95.toFixed(0)} ms · skew p95 ${summary.skewP95.toFixed(0)} ms · ${summary.bpm.toFixed(0)} bottles/min · last serial ${q.lastSerial}`
      : `${printed.length}/${opts.bottles} printed · ${failures.length ? `stopped at ${failures[0].code}: ${failures[0].reason}` : "stopped by operator"}`,
  };
}

export const MAX_TEST_SERIAL = SERIAL_MAX;
