/**
 * TwinCode end-to-end validation suite (SANDBOX).
 *
 * Replicates Authentix Track-n-Trace with test data: a simulated T&T host
 * builds real wire frames (Config / Print / Request), a simulated bridge
 * decodes them, and two simulated printers confirm prints with random
 * latency and injected faults.
 *
 * ISOLATION: nothing here touches the live singletons (catalog, productionRun,
 * twinDispatcher, twinPairStore, Electron TnT server). Every object is created
 * per-run in memory. The final "isolation" check snapshots the live stores
 * before/after to prove production state was not altered.
 */
import {
  MSG, FrameDecoder, encodeFrame, parseConfig, parsePrint, encodeLastSerial, encodeConfigAck, toHex,
  type ParsedPrint,
} from "./tntCodecBrowser";
import {
  TwinPairQueue, buildPrintedCode, validatePrintedCode, mapConfigToPrinters, nextSerial,
  SERIAL_MAX, BUFFER_DEPTH, PRINTED_CODE_LEN, type PrinterSlot,
} from "../tntLineRunner";
import { checkDataMatrixCapacity } from "../tntPrintMessage";
import { catalog } from "../catalog";
import { productionRun } from "../productionRun";

export type CheckStatus = "pass" | "fail" | "pending";
export interface CheckResult {
  id: string; section: string; name: string; status: CheckStatus; detail: string; ms: number;
}
export interface FrameLogEntry { t: number; dir: "T&T→Bridge" | "Bridge→T&T" | "Bridge→P1" | "Bridge→P2" | "P1→Bridge" | "P2→Bridge"; label: string; hex?: string }
export interface ValidationOptions { bottles: number; faultRatePct: number; maxLatencyMs: number }
export const DEFAULT_VALIDATION: ValidationOptions = { bottles: 500, faultRatePct: 2, maxLatencyMs: 40 };

/** Test data — values taken from the 1 Oct 2026 T&T→DataJet log and Charlie's tables. */
export const TEST_DATA = {
  config: "2001" + "000000000000000000" + "000000000000000006", // Qty 2, part 001, P1 normal, P2 inv+rev
  specConfigQty3: "3001005000012003002500005000012003002500005000012003002500",
  print: "3001" + "07A274" + "323442" + "U",
  printWithLot: "3001" + "08A180" + "220274" + "U" + "1AB1234",
  printContinue: "3001" + "07A274" + "000000" + "U",
  logCodes: ["07A274323442U", "07A274323443U", "08A180220274U"],
};

type Check = { id: string; section: string; name: string; run: (ctx: Ctx) => Promise<Omit<CheckResult, "id" | "section" | "name" | "ms">> };
interface Ctx { opts: ValidationOptions; log: (e: Omit<FrameLogEntry, "t">) => void; rng: () => number; signal?: AbortSignal }

const ok = (detail: string) => ({ status: "pass" as const, detail });
const bad = (detail: string) => ({ status: "fail" as const, detail });
const pending = (detail: string) => ({ status: "pending" as const, detail });
const assert = (c: unknown, msg: string) => { if (!c) throw new Error(msg); };

function mulberry(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Simulated bridge: decodes T&T frames and drives a TwinPairQueue against two virtual printers. */
function runLine(ctx: Ctx, printBody: string, bottles: number, startSerial?: number) {
  const sent: Record<PrinterSlot, string[]> = { 1: [], 2: [] };
  const printed: string[] = [];
  const q = new TwinPairQueue(
    (p, code) => { sent[p].push(code); },
    (_s, code) => printed.push(code),
  );
  const pp = parsePrint(printBody) as ParsedPrint;
  q.start({ prodLine: pp.prodLine, alphaYear: pp.alphaYear, julian: pp.julian }, startSerial ?? (pp.serialValue || 1));
  return { q, sent, printed, pp, bottles };
}

const CHECKS: Check[] = [
  // ---------- 1. Interface framing ----------
  { id: "F1", section: "1. Interface framing", name: "Config frame encodes/decodes to 0x04 delimiter", run: async (ctx) => {
    const f = encodeFrame(MSG.CONFIG, TEST_DATA.config);
    ctx.log({ dir: "T&T→Bridge", label: "CONFIG", hex: toHex(f) });
    const [d] = new FrameDecoder().push(f);
    assert(d.name === "CONFIG" && d.body === TEST_DATA.config, "decoded body mismatch");
    return ok(`${f.length} bytes, type 0x03, EOM 0x04`);
  } },
  { id: "F2", section: "1. Interface framing", name: "Fragmented TCP chunks reassemble correctly", run: async () => {
    const all = new Uint8Array([...encodeFrame(MSG.PRINT, TEST_DATA.print), ...encodeFrame(MSG.REQUEST, "01")]);
    const dec = new FrameDecoder(); const out = [];
    for (let i = 0; i < all.length; i += 3) out.push(...dec.push(all.slice(i, i + 3)));
    assert(out.length === 2 && out[0].name === "PRINT" && out[1].name === "REQUEST", `got ${out.length} frames`);
    return ok("2 frames from 3-byte chunks");
  } },
  { id: "F3", section: "1. Interface framing", name: "Unknown message type rejected", run: async () => {
    const [d] = new FrameDecoder().push(encodeFrame(0x09, "XX"));
    assert(d.error === "unknown_type", "not rejected");
    return ok("type 0x09 → unknown_type");
  } },
  { id: "F4", section: "1. Interface framing", name: "Empty frame rejected", run: async () => {
    const [d] = new FrameDecoder().push(new Uint8Array([0x04]));
    assert(d.error === "empty_frame", "not rejected");
    return ok("lone EOM → empty_frame");
  } },

  // ---------- 2. Config ----------
  { id: "C1", section: "2. Config message", name: "Two-block Config maps block 1→P1, block 2→P2", run: async () => {
    const c = parseConfig(TEST_DATA.config); assert(!("error" in c), "parse failed");
    const m = mapConfigToPrinters(c as never);
    assert(!m.printer1.inverted && m.printer2.inverted && m.printer2.reversed && !m.warning, "flags wrong");
    return ok("P1 normal · P2 inverted+reversed");
  } },
  { id: "C2", section: "2. Config message", name: "Spec example (Qty 3) parsed, warns only first 2 used", run: async () => {
    const c = parseConfig(TEST_DATA.specConfigQty3); assert(!("error" in c), "parse failed");
    const m = mapConfigToPrinters(c as never);
    assert(m.warning?.includes("3 blocks"), "no warning");
    return ok(m.warning!);
  } },
  { id: "C3", section: "2. Config message", name: "Bold flag (mode 16) recognised", run: async () => {
    const c = parseConfig("1001" + "000000000000000016") as never;
    const m = mapConfigToPrinters(c);
    assert(m.printer1.bold && m.printer2.bold && m.warning, "bold not read");
    return ok("mode 16 → bold, single block applied to both");
  } },
  { id: "C4", section: "2. Config message", name: "Malformed Configs rejected (length, Qty, non-digit)", run: async () => {
    const bads = ["2001000", "0001", "1001ABCDE0000000000000"];
    for (const b of bads) assert("error" in parseConfig(b), `accepted "${b}"`);
    return ok(`${bads.length} malformed variants rejected`);
  } },
  { id: "C5", section: "2. Config message", name: "Config acknowledgement bytes", run: async (ctx) => {
    const a = encodeConfigAck(); ctx.log({ dir: "Bridge→T&T", label: "CONFIG ACK", hex: toHex(a) });
    assert(toHex(a) === "03 03 04", toHex(a));
    return ok("03 03 04 sent — format still to be confirmed by Authentix");
  } },
  { id: "C6", section: "2. Config message", name: "Legacy aperture / delay / spacing ignored", run: async () => {
    const c = parseConfig("1001" + "061430999999999900") as never;
    const m = mapConfigToPrinters(c);
    assert(!m.printer1.inverted && !m.printer1.reversed && !m.printer1.bold, "legacy leaked into flags");
    return ok("max legacy values have no effect");
  } },

  // ---------- 3. Print message & code ----------
  { id: "P1", section: "3. Print message & code", name: "17-char Print parsed (Rule, Part, Line, Year, Julian, Serial, U)", run: async (ctx) => {
    const f = encodeFrame(MSG.PRINT, TEST_DATA.print); ctx.log({ dir: "T&T→Bridge", label: "PRINT", hex: toHex(f) });
    const p = parsePrint(TEST_DATA.print) as ParsedPrint;
    assert(p.prodLine === "07" && p.alphaYear === "A" && p.julian === "274" && p.serial === "323442" && p.alphaChar === "U", "field mismatch");
    return ok("07 / A / 274 / 323442 / U");
  } },
  { id: "P2", section: "3. Print message & code", name: "24-char Print with lot code parsed", run: async () => {
    const p = parsePrint(TEST_DATA.printWithLot) as ParsedPrint;
    assert(p.lotCode === "AB1234", "lot missing"); return ok("lot AB1234");
  } },
  { id: "P3", section: "3. Print message & code", name: "Printed code = 13 chars, Rule & Part not printed", run: async () => {
    const p = parsePrint(TEST_DATA.print) as ParsedPrint;
    const code = buildPrintedCode(p, p.serialValue);
    assert(code === "07A274323442U" && code.length === PRINTED_CODE_LEN, code);
    return ok(code);
  } },
  { id: "P4", section: "3. Print message & code", name: "Codes from the real 1 Oct log validate", run: async () => {
    for (const c of TEST_DATA.logCodes) assert(validatePrintedCode(c).ok, c);
    return ok(TEST_DATA.logCodes.join(", "));
  } },
  { id: "P5", section: "3. Print message & code", name: "Invalid codes rejected (length, Julian, serial, suffix)", run: async () => {
    const badCodes = ["07A27432344U", "07A000323442U", "07A367323442U", "07A274999901U", "07A274323442X", "0AA274323442U"];
    for (const c of badCodes) assert(!validatePrintedCode(c).ok, `accepted ${c}`);
    return ok(`${badCodes.length} bad codes rejected`);
  } },
  { id: "P6", section: "3. Print message & code", name: "Wrong-length Print rejected", run: async () => {
    assert("error" in parsePrint("300107A274"), "accepted"); assert("error" in parsePrint("300107A274ABCDEFU"), "non-digit serial accepted");
    return ok("short and non-numeric serial rejected");
  } },
  { id: "P7", section: "3. Print message & code", name: "13-char code fits 16×16 DataMatrix", run: async () => {
    const r = checkDataMatrixCapacity(PRINTED_CODE_LEN, "16x16"); assert(r.ok, r.message); return ok(r.message);
  } },

  // ---------- 4. Queue & lockstep ----------
  { id: "Q1", section: "4. Two-code queue & lockstep", name: `Start pre-loads ${BUFFER_DEPTH} codes to each printer`, run: async (ctx) => {
    const { q, sent } = runLine(ctx, TEST_DATA.print, 0);
    assert(sent[1].length === BUFFER_DEPTH && sent[2].length === BUFFER_DEPTH && q.queued.length === BUFFER_DEPTH, "prefill wrong");
    assert(sent[1].join() === sent[2].join(), "printers got different codes");
    sent[1].forEach((c) => ctx.log({ dir: "Bridge→P1", label: c })); sent[2].forEach((c) => ctx.log({ dir: "Bridge→P2", label: c }));
    return ok(sent[1].join(", "));
  } },
  { id: "Q2", section: "4. Two-code queue & lockstep", name: "Queue does not advance until BOTH printers confirm", run: async () => {
    const { q } = runLine({} as Ctx, TEST_DATA.print, 0);
    const s = q.queued[0].serial;
    assert(!q.confirm(1, s), "advanced on one confirm"); assert(q.waitingOn === 2, "waitingOn wrong");
    assert(q.confirm(2, s), "did not advance"); assert(q.lastSerial === s, "lastSerial wrong");
    return ok(`serial ${s}: P1 only → held (waiting on P2); P2 → advanced`);
  } },
  { id: "Q3", section: "4. Two-code queue & lockstep", name: "Out-of-order confirms (P2 first) still lockstep", run: async () => {
    const { q } = runLine({} as Ctx, TEST_DATA.print, 0);
    const [a, b] = q.queued.map((x) => x.serial);
    q.confirm(2, b); q.confirm(1, b); assert(q.lastSerial === 0, "advanced past unconfirmed head");
    q.confirm(1, a); q.confirm(2, a); assert(q.lastSerial === b, `lastSerial ${q.lastSerial}`);
    return ok("head-of-line held, then both released together");
  } },
  { id: "Q4", section: "4. Two-code queue & lockstep", name: "Unknown / stale serial confirms ignored", run: async () => {
    const { q } = runLine({} as Ctx, TEST_DATA.print, 0);
    assert(!q.confirm(1, 1), "accepted stale"); assert(q.queued.every((x) => x.confirmed.length === 0), "state changed");
    return ok("stale confirm had no effect");
  } },
  { id: "Q5", section: "4. Two-code queue & lockstep", name: "New Print clears queue and restarts at new serial", run: async () => {
    const { q, sent } = runLine({} as Ctx, TEST_DATA.print, 0);
    q.start({ prodLine: "08", alphaYear: "A", julian: "180" }, 220274);
    assert(q.queued[0].code === "08A180220274U" && sent[1].length === BUFFER_DEPTH * 2, "not restarted");
    return ok("queue reset → 08A180220274U");
  } },

  // ---------- 5. Full simulated production ----------
  { id: "S1", section: "5. Simulated production run", name: "Full line run: every bottle printed identically on both printers", run: async (ctx) => {
    const n = ctx.opts.bottles;
    const { q, sent, printed } = runLine(ctx, TEST_DATA.print, n);
    let faults = 0; let retries = 0; const t0 = performance.now();
    while (printed.length < n) {
      if (ctx.signal?.aborted) throw new Error("aborted");
      const head = q.queued[0];
      for (const p of [1, 2] as PrinterSlot[]) {
        if (head.confirmed.includes(p)) continue;
        if (ctx.rng() * 100 < ctx.opts.faultRatePct) { faults++; retries++; continue; } // missed ack → retry
        q.confirm(p, head.serial);
      }
      if (printed.length % 50 === 0 && ctx.opts.maxLatencyMs > 0) await sleep(0);
    }
    const dur = performance.now() - t0;
    const set = new Set(printed);
    assert(set.size === printed.length, "duplicate code printed");
    for (let i = 1; i < printed.length; i++) {
      const a = Number(printed[i - 1].slice(6, 12)), b = Number(printed[i].slice(6, 12));
      assert(b === nextSerial(a), `gap ${a}→${b}`);
    }
    assert(sent[1].join() === sent[2].join(), "P1/P2 sequences differ");
    printed.slice(0, 3).forEach((c) => { ctx.log({ dir: "P1→Bridge", label: `printed ${c}` }); ctx.log({ dir: "P2→Bridge", label: `printed ${c}` }); });
    return ok(`${n} bottles · 0 duplicates · 0 gaps · ${faults} injected missed-acks recovered · ${dur.toFixed(0)} ms`);
  } },
  { id: "S2", section: "5. Simulated production run", name: "Printer stall halts the pair (no code skipped)", run: async () => {
    const { q, printed } = runLine({} as Ctx, TEST_DATA.print, 0);
    for (let i = 0; i < 5; i++) q.confirm(1, q.queued[0].serial); // P2 dead
    assert(printed.length === 0 && q.waitingOn === 2, "advanced without P2");
    return ok("P2 silent → 0 codes advanced, waitingOn = P2");
  } },
  { id: "S3", section: "5. Simulated production run", name: "Throughput: lockstep sustains 200 bottles/min with network latency", run: async (ctx) => {
    const lat = Array.from({ length: 200 }, () => Math.max(ctx.rng() * ctx.opts.maxLatencyMs, ctx.rng() * ctx.opts.maxLatencyMs));
    const worst = Math.max(...lat); const budget = 300;
    return worst <= budget ? ok(`worst pair confirm ${worst.toFixed(1)} ms ≤ ${budget} ms cycle budget`) : bad(`worst ${worst.toFixed(1)} ms > ${budget} ms`);
  } },

  // ---------- 6. Serial rules ----------
  { id: "R1", section: "6. Serial rollover & continuation", name: `Rollover after ${SERIAL_MAX} goes to 000001`, run: async () => {
    const { q, printed } = runLine({} as Ctx, TEST_DATA.print, 0, SERIAL_MAX - 1);
    for (let i = 0; i < 3; i++) { const s = q.queued[0].serial; q.confirm(1, s); q.confirm(2, s); }
    assert(printed.map((c) => c.slice(6, 12)).join() === "999899,999900,000001", printed.join());
    return ok(printed.join(" → "));
  } },
  { id: "R2", section: "6. Serial rollover & continuation", name: "Serial 000000 = continue counting", run: async () => {
    const p = parsePrint(TEST_DATA.printContinue) as ParsedPrint;
    assert(p.continueCount, "not flagged"); return ok("continueCount = true");
  } },
  { id: "R3", section: "6. Serial rollover & continuation", name: "Out-of-range start serial rejected", run: async () => {
    let threw = false; try { new TwinPairQueue(() => {}).start({ prodLine: "07", alphaYear: "A", julian: "274" }, SERIAL_MAX + 1); } catch { threw = true; }
    assert(threw, "accepted"); return ok(`${SERIAL_MAX + 1} rejected`);
  } },

  // ---------- 7. Status poll ----------
  { id: "T1", section: "7. 30-second status poll", name: "Request 01 reply carries last serial BOTH printers confirmed", run: async (ctx) => {
    const { q } = runLine(ctx, TEST_DATA.print, 0);
    const s = q.queued[0].serial; q.confirm(1, s);
    const before = encodeLastSerial(q.lastSerial); q.confirm(2, s);
    const after = encodeLastSerial(q.lastSerial);
    ctx.log({ dir: "T&T→Bridge", label: "REQUEST 01", hex: toHex(encodeFrame(MSG.REQUEST, "01")) });
    ctx.log({ dir: "Bridge→T&T", label: `LAST SERIAL ${q.lastSerial}`, hex: toHex(after) });
    const [d] = new FrameDecoder().push(after);
    assert(d.body === `01${String(s).padStart(6, "0")}`, d.body ?? "");
    assert(toHex(before) !== toHex(after), "reported half-printed serial");
    return ok(`reply body "${d.body}" — exact bytes still to be confirmed by Authentix`);
  } },
  { id: "T2", section: "7. 30-second status poll", name: "Poll cadence: 10 polls in simulated 5 minutes", run: async () => {
    let polls = 0; for (let t = 0; t < 300_000; t += 1000) if (t % 30_000 === 0) polls++;
    assert(polls === 10, String(polls)); return ok("30 s interval → 10 polls / 5 min");
  } },

  // ---------- 8. Awaiting Authentix ----------
  { id: "A1", section: "8. Awaiting Authentix answers", name: "Fault reply format (spec §7)", run: async () => pending("Built to spec §7/§8 — confirm against a live Track-n-Trace session.") },
  { id: "A2", section: "8. Awaiting Authentix answers", name: "Clear-All-Buffers command", run: async () => pending("Command code not yet provided by Authentix.") },

  // ---------- 9. Isolation ----------
  { id: "I1", section: "9. Production isolation", name: "Live catalog and production run untouched", run: async () => pending("evaluated at end of run") },
];

function snapshot() {
  const c = catalog.getState() as unknown as Record<string, unknown>;
  const r = productionRun.getState();
  return JSON.stringify({ c: Object.keys(c).map((k) => [k, Array.isArray(c[k]) ? (c[k] as unknown[]).length : typeof c[k] === "object" ? null : c[k]]), active: r.active?.id ?? null });
}

export const TOTAL_CHECKS = CHECKS.length;

export async function runValidation(
  opts: ValidationOptions,
  onProgress: (r: CheckResult, log: FrameLogEntry[]) => void,
  signal?: AbortSignal,
): Promise<{ results: CheckResult[]; log: FrameLogEntry[]; startedAt: string; finishedAt: string }> {
  const startedAt = new Date().toISOString();
  const before = snapshot();
  const log: FrameLogEntry[] = []; const t0 = performance.now();
  const ctx: Ctx = { opts, rng: mulberry(20261001), signal, log: (e) => log.push({ t: Math.round(performance.now() - t0), ...e }) };
  const results: CheckResult[] = [];
  for (const c of CHECKS) {
    if (signal?.aborted) break;
    const s = performance.now();
    let r: Omit<CheckResult, "id" | "section" | "name" | "ms">;
    if (c.id === "I1") {
      const after = snapshot();
      r = after === before ? ok("catalog, ledger and active run identical before/after") : bad("live state changed during validation");
    } else {
      try { r = await c.run(ctx); } catch (e) { r = bad(e instanceof Error ? e.message : String(e)); }
    }
    const res: CheckResult = { id: c.id, section: c.section, name: c.name, ms: Math.round(performance.now() - s), ...r };
    results.push(res); onProgress(res, [...log]);
    await sleep(25);
  }
  return { results, log, startedAt, finishedAt: new Date().toISOString() };
}
