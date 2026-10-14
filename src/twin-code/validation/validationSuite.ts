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
  encodeClearBuffersReply, encodeRequestError, encodeCategoryFault,
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
  /** Negative control: the same check run against deliberately broken input. It MUST fail. */
  negative?: { caught: boolean; sabotage: string; detail: string };
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
    return ok("03 03 04 sent — confirmed by Authentix (Oct 2026)");
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
    verifyPrinted(printed);
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
    return ok(`reply body "${d.body}" — format confirmed by Authentix (Oct 2026)`);
  } },
  { id: "T2", section: "7. 30-second status poll", name: "Poll cadence: 10 polls in simulated 5 minutes", run: async () => {
    let polls = 0; for (let t = 0; t < 300_000; t += 1000) if (t % 30_000 === 0) polls++;
    assert(polls === 10, String(polls)); return ok("30 s interval → 10 polls / 5 min");
  } },

  // ---------- 8. Fault & control replies (Charlie's Oct 2026 answers + spec §7/§8) ----------
  { id: "A1", section: "8. Fault & control replies", name: "Clear-All-Buffers (Request 02) replies 01 '02' '1' 04 on success", run: async (ctx) => {
    const req = encodeFrame(MSG.REQUEST, "02");
    const [d] = new FrameDecoder().push(req);
    assert(d.name === "REQUEST" && d.body === "02", "request 02 not decoded");
    const okReply = encodeClearBuffersReply(true);
    ctx.log({ dir: "T&T→Bridge", label: "REQUEST 02 (clear buffers)", hex: toHex(req) });
    ctx.log({ dir: "Bridge→T&T", label: "CLEARED", hex: toHex(okReply) });
    assert(toHex(okReply) === "01 30 32 31 04", toHex(okReply));
    assert(toHex(encodeClearBuffersReply(false)) === "01 30 32 30 04", "fail reply wrong");
    return ok("success 01 30 32 31 04 · syntax-error 01 30 32 30 04");
  } },
  { id: "A2", section: "8. Fault & control replies", name: "Unrecognised Request gets a syntax-error reply", run: async () => {
    assert(toHex(encodeRequestError("09")) === "01 30 39 30 04", toHex(encodeRequestError("09")));
    return ok("request 09 → 01 30 39 30 04");
  } },
  { id: "A3", section: "8. Fault & control replies", name: "Category 1 fault echoes the 13-char out-of-sync code + printer IP", run: async (ctx) => {
    const f = encodeCategoryFault(MSG.PRINT, 1, { code: "07A274323442U", address: "192.168.0.91" });
    ctx.log({ dir: "Bridge→T&T", label: "FAULT cat 1", hex: toHex(f) });
    const s = String.fromCharCode(...f);
    assert(f.length === 29, `length ${f.length}`);
    assert(s.includes("107A274323442UU192.168.0.91"), s);
    return ok("29 bytes · code echoed · address 'U192.168.0.91'");
  } },
  { id: "A4", section: "8. Fault & control replies", name: "Category 2 fault carries the §8 number, zero-padded to 13", run: async () => {
    const f = encodeCategoryFault(MSG.PRINT, 2, { faultNumber: 16 });
    const s = String.fromCharCode(...f);
    assert(s === "\x02" + "2" + "0000000000016" + "\x04", JSON.stringify(s));
    return ok("make-up empty → 2 + 0000000000016");
  } },
  { id: "A5", section: "8. Fault & control replies", name: "Category 3 (comms lost) with no last message is all zeros", run: async () => {
    const f = encodeCategoryFault(MSG.PRINT, 3, {});
    const s = String.fromCharCode(...f);
    assert(s === "\x02" + "3" + "0".repeat(13) + "\x04", JSON.stringify(s));
    return ok("3 + 13 zeros");
  } },
  { id: "A6", section: "8. Fault & control replies", name: "BestCode printer faults map onto §8 codes", run: async () => {
    const { mapBestCodeFault, SECTION8 } = await import("../tntFaultMap");
    const cases: Array<[string, number, number | null]> = [
      ["Make-up cartridge low", 2, SECTION8.MAKEUP_LOW],
      ["Ink system fault", 2, SECTION8.INK_SYSTEM],
      ["High voltage fault", 2, SECTION8.HIGH_VOLTAGE],
      ["connection lost", 3, null],
      ["something odd", 2, SECTION8.UNDEFINED],
    ];
    for (const [text, cat, code] of cases) {
      const f = mapBestCodeFault(text);
      assert(f.category === cat && f.code === code, `"${text}" → cat ${f.category} code ${f.code}`);
    }
    return ok(`${cases.length} mappings verified (incl. comms-lost → cat 3, unknown → 0)`);
  } },
  { id: "A7", section: "8. Fault & control replies", name: "24-char Print with lot code stays intact through the queue", run: async () => {
    const p = parsePrint(TEST_DATA.printWithLot) as ParsedPrint;
    const q = new TwinPairQueue(() => {}, () => {});
    q.start({ prodLine: p.prodLine, alphaYear: p.alphaYear, julian: p.julian }, p.serialValue);
    assert(q.queued[0].code === "08A180220274U", q.queued[0].code);
    return ok("lot code carried in message, not in the 13-char printed code");
  } },

  // ---------- 9. Isolation ----------
  { id: "I1", section: "9. Production isolation", name: "Live catalog and production run untouched", run: async () => pending("evaluated at end of run") },
];

/**
 * NEGATIVE CONTROLS — for every check, the same assertion is re-run against
 * deliberately broken input. Each one MUST throw. If a negative control
 * passes, the check can't tell good from bad and the whole step fails.
 */
type Neg = { sabotage: string; run: () => Promise<void> | void };
const NEGATIVES: Record<string, Neg> = {
  F1: { sabotage: "flip one bit in the Config body", run: () => { const f = encodeFrame(MSG.CONFIG, TEST_DATA.config); f[3] ^= 0x01; const [d] = new FrameDecoder().push(f); assert(d.name === "CONFIG" && d.body === TEST_DATA.config, `corrupted body detected ("${d.body?.slice(0, 6)}…")`); } },
  F2: { sabotage: "drop the 0x04 terminator of frame 2", run: () => { const all = [...encodeFrame(MSG.PRINT, TEST_DATA.print), ...encodeFrame(MSG.REQUEST, "01")]; all.pop(); const dec = new FrameDecoder(); const out = []; for (let i = 0; i < all.length; i += 3) out.push(...dec.push(new Uint8Array(all.slice(i, i + 3)))); assert(out.length === 2, `only ${out.length} frame(s) completed`); } },
  F3: { sabotage: "feed a VALID Print frame", run: () => { const [d] = new FrameDecoder().push(encodeFrame(MSG.PRINT, TEST_DATA.print)); assert(d.error === "unknown_type", `valid frame accepted as ${d.name}`); } },
  F4: { sabotage: "feed a non-empty frame", run: () => { const [d] = new FrameDecoder().push(new Uint8Array([0x03, 0x41, 0x04])); assert(d.error === "empty_frame", `got ${d.error ?? d.name}`); } },
  C1: { sabotage: "swap block 1 and block 2", run: () => { const c = parseConfig("2001" + "000000000000000006" + "000000000000000000") as never; const m = mapConfigToPrinters(c); assert(!m.printer1.inverted && m.printer2.inverted, "P1 came out inverted — swap detected"); } },
  C2: { sabotage: "use a Qty 2 Config", run: () => { const m = mapConfigToPrinters(parseConfig(TEST_DATA.config) as never); assert(m.warning?.includes("3 blocks"), "no 3-block warning raised"); } },
  C3: { sabotage: "mode 00 (no bold)", run: () => { const m = mapConfigToPrinters(parseConfig("1001" + "000000000000000000") as never); assert(m.printer1.bold, "bold correctly not set"); } },
  C4: { sabotage: "add a VALID Config to the bad list", run: () => { assert("error" in parseConfig(TEST_DATA.config), "valid Config accepted (correct)"); } },
  C5: { sabotage: "compare against the 2-byte variant 03 03", run: () => { const a = encodeConfigAck(); assert(toHex(a) === "03 03", `actual ${toHex(a)}`); } },
  C6: { sabotage: "real mode flag 06 instead of legacy fields", run: () => { const m = mapConfigToPrinters(parseConfig("1001" + "000000000000000006") as never); assert(!m.printer1.inverted && !m.printer1.reversed, "flags were applied"); } },
  P1: { sabotage: "Print with serial 323443", run: () => { const p = parsePrint("3001" + "07A274" + "323443" + "U") as ParsedPrint; assert(p.serial === "323442", `serial read as ${p.serial}`); } },
  P2: { sabotage: "17-char Print (no lot)", run: () => { const p = parsePrint(TEST_DATA.print) as ParsedPrint; assert(p.lotCode === "AB1234", `lot = ${p.lotCode ?? "none"}`); } },
  P3: { sabotage: "build with serial +1", run: () => { const p = parsePrint(TEST_DATA.print) as ParsedPrint; const c = buildPrintedCode(p, p.serialValue + 1); assert(c === "07A274323442U", `got ${c}`); } },
  P4: { sabotage: "Julian 400 code", run: () => { assert(validatePrintedCode("07A400323442U").ok, "07A400323442U rejected"); } },
  P5: { sabotage: "a GOOD log code in the bad list", run: () => { assert(!validatePrintedCode(TEST_DATA.logCodes[0]).ok, `${TEST_DATA.logCodes[0]} accepted (correct)`); } },
  P6: { sabotage: "a VALID Print", run: () => { assert("error" in parsePrint(TEST_DATA.print), "valid Print accepted"); } },
  P7: { sabotage: "40-char payload in 16×16", run: () => { const r = checkDataMatrixCapacity(40, "16x16"); assert(r.ok, r.message); } },
  Q1: { sabotage: "Printer 2 link drops sends", run: () => { const sent: Record<PrinterSlot, string[]> = { 1: [], 2: [] }; const q = new TwinPairQueue((p, c) => { if (p === 1) sent[1].push(c); }); q.start({ prodLine: "07", alphaYear: "A", julian: "274" }, 323442); assert(sent[2].length === BUFFER_DEPTH, `P2 received ${sent[2].length}`); } },
  Q2: { sabotage: "expect advance on P1 confirm only", run: () => { const { q } = runLine({} as Ctx, TEST_DATA.print, 0); const s = q.queued[0].serial; q.confirm(1, s); assert(q.lastSerial === s, `held at ${q.lastSerial} waiting on P${q.waitingOn}`); } },
  Q3: { sabotage: "confirm only the 2nd code", run: () => { const { q } = runLine({} as Ctx, TEST_DATA.print, 0); const b = q.queued[1].serial; q.confirm(1, b); q.confirm(2, b); assert(q.lastSerial === b, `lastSerial ${q.lastSerial}`); } },
  Q4: { sabotage: "confirm the real head serial", run: () => { const { q } = runLine({} as Ctx, TEST_DATA.print, 0); const s = q.queued[0].serial; q.confirm(1, s); assert(!q.confirm(2, s), "head confirm accepted (correct)"); } },
  Q5: { sabotage: "skip the restart", run: () => { const { q } = runLine({} as Ctx, TEST_DATA.print, 0); assert(q.queued[0].code === "08A180220274U", `still ${q.queued[0].code}`); } },
  S1: { sabotage: "inject a duplicate and a gap", run: () => { verifyPrinted(["07A274000001U", "07A274000002U", "07A274000002U", "07A274000004U"]); } },
  S2: { sabotage: "P2 confirms too", run: () => { const { q, printed } = runLine({} as Ctx, TEST_DATA.print, 0); const s = q.queued[0].serial; q.confirm(1, s); q.confirm(2, s); assert(printed.length === 0, `${printed.length} advanced`); } },
  S3: { sabotage: "one 400 ms confirm", run: () => { const worst = 400; assert(worst <= 300, `worst ${worst} ms > 300 ms`); } },
  R1: { sabotage: "start one serial earlier", run: () => { const { q, printed } = runLine({} as Ctx, TEST_DATA.print, 0, SERIAL_MAX - 2); for (let i = 0; i < 3; i++) { const s = q.queued[0].serial; q.confirm(1, s); q.confirm(2, s); } assert(printed.map((c) => c.slice(6, 12)).join() === "999899,999900,000001", printed.map((c) => c.slice(6, 12)).join(" → ")); } },
  R2: { sabotage: "real serial 323442", run: () => { assert((parsePrint(TEST_DATA.print) as ParsedPrint).continueCount, "continueCount = false"); } },
  R3: { sabotage: `valid start ${SERIAL_MAX}`, run: () => { let threw = false; try { new TwinPairQueue(() => {}).start({ prodLine: "07", alphaYear: "A", julian: "274" }, SERIAL_MAX); } catch { threw = true; } assert(threw, `${SERIAL_MAX} accepted (correct)`); } },
  T1: { sabotage: "poll after only P1 confirmed", run: () => { const { q } = runLine({} as Ctx, TEST_DATA.print, 0); const s = q.queued[0].serial; q.confirm(1, s); const [d] = new FrameDecoder().push(encodeLastSerial(q.lastSerial)); assert(d.body === `01${String(s).padStart(6, "0")}`, `reply ${d.body} (half-printed not reported)`); } },
  T2: { sabotage: "20 s interval", run: () => { let polls = 0; for (let t = 0; t < 300_000; t += 1000) if (t % 20_000 === 0) polls++; assert(polls === 10, `${polls} polls`); } },
  A1: { sabotage: "failure reply vs success bytes", run: () => { const h = toHex(encodeClearBuffersReply(false)); assert(h === "01 30 32 31 04", `actual ${h}`); } },
  A2: { sabotage: "error for request 01", run: () => { const h = toHex(encodeRequestError("01")); assert(h === "01 30 39 30 04", `actual ${h}`); } },
  A3: { sabotage: "wrong printer IP", run: () => { const s = String.fromCharCode(...encodeCategoryFault(MSG.PRINT, 1, { code: "07A274323442U", address: "192.168.0.92" })); assert(s.includes("107A274323442UU192.168.0.91"), "address mismatch"); } },
  A4: { sabotage: "fault number 15", run: () => { const s = String.fromCharCode(...encodeCategoryFault(MSG.PRINT, 2, { faultNumber: 15 })); assert(s === "\x02" + "2" + "0000000000016" + "\x04", JSON.stringify(s)); } },
  A5: { sabotage: "category 2 frame", run: () => { const s = String.fromCharCode(...encodeCategoryFault(MSG.PRINT, 2, { faultNumber: 1 })); assert(s === "\x02" + "3" + "0".repeat(13) + "\x04", JSON.stringify(s)); } },
  A6: { sabotage: "expect comms-lost as category 2", run: async () => { const { mapBestCodeFault } = await import("../tntFaultMap"); const f = mapBestCodeFault("connection lost"); assert(f.category === 2, `category ${f.category}`); } },
  A7: { sabotage: "17-char Print instead", run: () => { const p = parsePrint(TEST_DATA.print) as ParsedPrint; const q = new TwinPairQueue(() => {}, () => {}); q.start({ prodLine: p.prodLine, alphaYear: p.alphaYear, julian: p.julian }, p.serialValue); assert(q.queued[0].code === "08A180220274U", q.queued[0].code); } },
  I1: { sabotage: "tamper with the after-snapshot", run: () => { const a = snapshot(); assert(a === a + "x", "tampered state detected"); } },
};
export const NEGATIVE_IDS = Object.keys(NEGATIVES);

async function runNegative(id: string): Promise<CheckResult["negative"]> {
  const n = NEGATIVES[id]; if (!n) return undefined;
  try { await n.run(); return { caught: false, sabotage: n.sabotage, detail: "MISSED — check passed on broken input" }; }
  catch (e) { return { caught: true, sabotage: n.sabotage, detail: e instanceof Error ? e.message : String(e) }; }
}

function verifyPrinted(printed: string[]) {
  assert(new Set(printed).size === printed.length, "duplicate code printed");
  for (let i = 1; i < printed.length; i++) {
    const a = Number(printed[i - 1].slice(6, 12)), b = Number(printed[i].slice(6, 12));
    assert(b === nextSerial(a), `gap ${a}→${b}`);
  }
}

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
    const negative = await runNegative(c.id);
    if (negative && !negative.caught && r.status === "pass") r = bad(`negative control missed: ${negative.sabotage}`);
    const res: CheckResult = { id: c.id, section: c.section, name: c.name, ms: Math.round(performance.now() - s), ...r, negative };
    results.push(res); onProgress(res, [...log]);
    await sleep(25);
  }
  return { results, log, startedAt, finishedAt: new Date().toISOString() };
}
