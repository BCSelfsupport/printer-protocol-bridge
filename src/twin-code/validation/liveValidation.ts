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

/** Log the last few commands each bound printer saw, so a dropped link shows which command lost it. */
async function logRecentCommands(log: (e: LiveLogEntry) => void): Promise<void> {
  const ids = twinDispatcher.getBoundIds();
  if (!ids) return;
  const { getCommandLog } = await import("@/lib/printerCommandLog");
  for (const [label, id] of [["P1", ids.aId], ["P2", ids.bId]] as const) {
    const recent = getCommandLog(id).slice(-6);
    for (const c of recent) {
      const t = new Date(c.startedAt).toISOString().slice(11, 23);
      const outcome = c.ok ? `ok ${c.durationMs}ms` : `FAIL ${c.error ?? "no reply"} (${c.durationMs}ms)`;
      log({ t, dir: `${label} history`, text: `${c.command} → ${outcome}` });
    }
  }
}

export function safetyCheck(): LiveStepResult {
  const problems: string[] = [];
  if (productionRun.getState().active) problems.push("a production run is active — stop it first");
  if (twinDispatcher.getPhotocellMirrorState().active) problems.push("the line (photocell mirror) is running — stop it first");
  return problems.length ? { ok: false, detail: problems.join("; ") } : { ok: true, detail: "No production run or live line active — safe to send test codes." };
}

/** True when this validation session opened the live link itself (so it closes it again). */
let validationOwnsLink = false;
/** Printers + pair used by the last successful connection check, so later steps can reopen a dropped link. */
let lastPrinters: Printer[] = [];

/** Reopen the live link (e.g. after the printer or the PC dropped the socket between steps). */
async function reopenLink(): Promise<{ ok: boolean; error?: string }> {
  const pair = twinPairStore.getState();
  if (!pair.a || !pair.b) return { ok: false, error: "no bound pair" };
  if (twinDispatcher.isBound()) await twinDispatcher.unbind().catch(() => {});
  const res = await twinDispatcher.bind(pair, lastPrinters, {
    messageNameA: pair.a.messageName, messageNameB: pair.b.messageName,
    fieldA: pair.a.fieldIndex, fieldB: pair.b.fieldIndex,
    subcommandA: pair.a.subcommand, subcommandB: pair.b.subcommand,
    autoCreateA: false, autoCreateB: false, autoCodeMode: false, skipFieldCheck: true,
  });
  if (res.ok) validationOwnsLink = true;
  return { ok: res.ok, error: res.error };
}
const isDropped = (reason?: string) => !!reason && /no active connection|not-active|not bound|send-failed/i.test(reason);

/** Close the live link if (and only if) validation opened it. */
export async function releaseValidationLink(): Promise<void> {
  if (validationOwnsLink && twinDispatcher.isBound()) await twinDispatcher.unbind().catch(() => {});
  validationOwnsLink = false;
}

interface SideProbe { label: string; ip: string; ok: boolean; width: number | null; delay: number | null; reason?: string; raw?: string }

const readNumber = (raw: string | undefined, keys: string[]): number | null => {
  if (!raw) return null;
  const cleaned = raw.replace(/^success$/gim, "").trim();
  for (const k of keys) {
    const m = cleaned.match(new RegExp(`${k}\\s*[:=]?\\s*(-?\\d+)`, "i"));
    if (m) return parseInt(m[1], 10);
  }
  const line = cleaned.split(/\r?\n/).map(l => l.trim()).find(l => /^-?\d+$/.test(l));
  return line ? parseInt(line, 10) : null;
};

/** Ask one printer for width + delay over the normal connection, and explain any failure in plain words. */
async function probeSide(label: string, ip: string, printer: Printer | undefined): Promise<SideProbe> {
  if (!printer) return { label, ip, ok: false, width: null, delay: null, reason: `${ip} is not in the printer list on the home screen` };
  const pid = printer.id;
  const { printerTransport } = await import("@/lib/printerTransport");
  // The home screen only shows reachability; the command connection is opened on demand.
  // Open it (or reuse it if already open) before asking anything.
  try {
    const c = await printerTransport.connect({ id: printer.id, ipAddress: printer.ipAddress, port: printer.port }) as { success?: boolean; error?: string } | null;
    if (!c?.success) {
      return { label, ip, ok: false, width: null, delay: null, reason: `could not open a connection to ${ip}:${printer.port}${c?.error ? ` — ${c.error}` : ""}. Make sure no other program (e.g. a Telnet window) is connected to this printer.` };
    }
  } catch (e) {
    return { label, ip, ok: false, width: null, delay: null, reason: `could not open a connection to ${ip}:${printer.port} — ${String((e as Error)?.message ?? e)}` };
  }
  const ask = async (cmd: string) => {
    const t0 = performance.now();
    try {
      const r = await printerTransport.sendCommand(pid, cmd, { maxWaitMs: 3000 });
      return { r, ms: Math.round(performance.now() - t0) };
    } catch (e) {
      return { r: { success: false, error: String((e as Error)?.message ?? e) } as { success: boolean; response?: string; error?: string }, ms: Math.round(performance.now() - t0) };
    }
  };
  const pw = await ask("^PW");
  const da = await ask("^DA");
  const width = pw.r?.success ? readNumber(pw.r.response, ["PW", "Pad\\s*Width", "Print\\s*Width", "Width"]) : null;
  const delay = da.r?.success ? readNumber(da.r.response, ["DA", "FwdDelay", "Fwd\\s*Delay", "Forward\\s*Delay", "Delay"]) : null;
  if (width != null || delay != null) return { label, ip, ok: true, width, delay };
  const describe = (cmd: string, x: { r: { success: boolean; response?: string; error?: string } | null; ms: number }) => {
    if (!x.r) return `${cmd}: no answer`;
    if (!x.r.success) return `${cmd}: ${x.r.error || "no answer"} after ${x.ms} ms`;
    const txt = (x.r.response || "").replace(/\s+/g, " ").trim();
    return txt ? `${cmd}: replied "${txt.slice(0, 60)}" but no number found` : `${cmd}: connected but empty reply after ${x.ms} ms`;
  };
  return { label, ip, ok: false, width, delay, reason: `${describe("^PW", pw)}; ${describe("^DA", da)}`, raw: `${pw.r?.response ?? ""} | ${da.r?.response ?? ""}` };
}

export async function connectionCheck(printers: Printer[] = []): Promise<LiveStepResult> {
  const safety = safetyCheck();
  if (!safety.ok) return safety;
  const pair = twinPairStore.getState();
  if (!pair.a || !pair.b) return { ok: false, detail: "No bound pair. Press Bind Pair, choose both printers, then retry." };

  if (printers.length) lastPrinters = printers;
  const findId = (ip: string, port: number) => printers.find(p => p.ipAddress === ip && p.port === port);
  const lines: string[] = [];
  let probes: SideProbe[] | null = null;

  if (!twinDispatcher.isBound()) {
    // 1) Ask each printer directly BEFORE switching them into live (one-to-one) mode —
    //    in that mode the printers only listen for print data, so settings queries go unanswered.
    probes = await Promise.all([
      probeSide("Printer 1 (lid)", pair.a.ip, findId(pair.a.ip, pair.a.port)),
      probeSide("Printer 2 (side)", pair.b.ip, findId(pair.b.ip, pair.b.port)),
    ]);
    for (const p of probes) {
      lines.push(p.ok
        ? `✓ ${p.label} ${p.ip}: width ${p.width ?? "?"}, delay ${p.delay ?? "?"}`
        : `✗ ${p.label} ${p.ip}: ${p.reason}`);
    }
    const bad = probes.filter(p => !p.ok);
    if (bad.length) {
      return {
        ok: false,
        detail: `No reply from ${bad.map(b => b.label).join(" and ")}.\n${lines.join("\n")}\nCheck the printer is switched on, shows as online on the home screen, and the IP/port match the pair.`,
        data: probes,
      };
    }

    // 2) Open the live link (test only — closed again when the window closes).
    const res = await twinDispatcher.bind(pair, printers, {
      messageNameA: pair.a.messageName, messageNameB: pair.b.messageName,
      fieldA: pair.a.fieldIndex, fieldB: pair.b.fieldIndex,
      subcommandA: pair.a.subcommand, subcommandB: pair.b.subcommand,
      autoCreateA: pair.a.autoCreate ?? true, autoCreateB: pair.b.autoCreate ?? true,
      autoCodeMode: false,
      // Printers in One-to-One mode don't answer ^LF. Steps 4–7 prove the field prints.
      skipFieldCheck: true,
    });
    if (!res.ok) {
      return { ok: false, detail: `${lines.join("\n")}\n✗ Both printers answered, but the live print link could not open: ${res.error ?? "unknown error"}`, data: probes };
    }
    validationOwnsLink = true;
    lines.push(`✓ Live print link open (messages ${pair.a.messageName} / ${pair.b.messageName})`);
    const ids = twinDispatcher.getBoundIds();
    return { ok: true, detail: `Both printers answered and the live link is open (IDs ${ids?.aId}/${ids?.bId}).\n${lines.join("\n")}`, data: probes };
  }

  // Link was already open (e.g. bound elsewhere). Printers may ignore settings queries in live mode,
  // so a successful bind is the pass condition; width/delay are shown when available.
  const ids = twinDispatcher.getBoundIds();
  const params = await twinDispatcher.fetchLivePrintParams().catch(() => null);
  const fmt = (s?: { widthDots: number | null; delayDots: number | null }) =>
    s && (s.widthDots != null || s.delayDots != null) ? `width ${s.widthDots ?? "?"}, delay ${s.delayDots ?? "?"}` : "settings not readable in live mode";
  return {
    ok: true,
    detail: `Live link already open (IDs ${ids?.aId}/${ids?.bId}).\n✓ Printer 1 (lid): ${fmt(params?.a)}\n✓ Printer 2 (side): ${fmt(params?.b)}`,
    data: params,
  };
}

/** How each print is released: the real photocell on the line, or a host Print Go (bench, no product). */
export type TriggerMode = "photocell" | "printgo";
const dispatchOpts = (t: TriggerMode) => ({ forceTrigger: t === "printgo" });
const waitNote = (t: TriggerMode) => t === "photocell" ? " — waiting for photocell (send a product past the sensor, max 30 s)" : "";

export async function sendSingle(code: string, log: (e: LiveLogEntry) => void, trigger: TriggerMode = "photocell"): Promise<LiveStepResult> {
  const safety = safetyCheck();
  if (!safety.ok) return safety;
  const v = validatePrintedCode(code);
  if ("error" in v) return { ok: false, detail: v.error };
  log({ t: now(), dir: "CodeSync→P1+P2", text: code + waitNote(trigger) });
  let r = await twinDispatcher.dispatch(code, dispatchOpts(trigger));
  if (!r.ok && isDropped(r.reason)) {
    log({ t: now(), dir: "CodeSync", text: `Link dropped (${r.reason}) — reconnecting to both printers and retrying once` });
    await logRecentCommands(log);
    const re = await reopenLink();
    if (!re.ok) {
      log({ t: now(), dir: "CodeSync", text: `Reconnect failed: ${re.error ?? "unknown"}` });
      return { ok: false, detail: `The printer connection dropped after step 3 and could not be reopened: ${re.error ?? "unknown"}. Re-run step 3, then try again.` };
    }
    r = await twinDispatcher.dispatch(code, dispatchOpts(trigger));
  }
  if (!r.ok) await logRecentCommands(log);
  log({ t: now(), dir: "P1+P2→CodeSync", text: r.ok ? `ACK both · A ${r.aMs?.toFixed(0)}ms B ${r.bMs?.toFixed(0)}ms` : `FAIL ${r.reason}` });
  return r.ok
    ? { ok: true, detail: `Sent ${code} · P1 ${r.aMs?.toFixed(0)} ms · P2 ${r.bMs?.toFixed(0)} ms · skew ${r.skewMs?.toFixed(0)} ms`, data: r }
    : { ok: false, detail: `Send failed: ${r.reason}`, data: r };
}

/** Send N consecutive codes to both printers, one after another, logging each transmit. */
export async function sendBatch(codes: string[], log: (e: LiveLogEntry) => void, onSent?: (index: number, code: string, ok: boolean) => void, trigger: TriggerMode = "photocell"): Promise<LiveStepResult> {
  const sent: string[] = []; const failed: { code: string; reason: string }[] = [];
  for (let i = 0; i < codes.length; i++) {
    const r = await sendSingle(codes[i], log, trigger);
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
  startSerial: number; bottles: number; gapMs: number; trigger?: TriggerMode;
  log: (e: LiveLogEntry) => void; onProgress: (done: number, total: number) => void; signal?: AbortSignal;
}): Promise<LiveStepResult & { summary?: LiveRunSummary }> {
  const safety = safetyCheck();
  if (!safety.ok) return safety;
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
    const trig = opts.trigger ?? "photocell";
    if (trig === "photocell") log({ t: now(), dir: "Bridge", text: `${head.code} loaded${waitNote(trig)}` });
    const r: TwinDispatchResult = await twinDispatcher.dispatch(head.code, dispatchOpts(trig));
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
    if (opts.gapMs > 0 && (opts.trigger ?? "photocell") === "printgo") await new Promise((res) => setTimeout(res, opts.gapMs));
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

// ─────────────────────────────────────────────────────────────────────────────
// Part 2 — REAL Track-n-Trace data connection.
// Uses the desktop app's real T&T endpoint: the real T&T PC connects, sends its
// own Config + Print message, we print N photocell-triggered codes on both
// printers, report each confirmed serial to the endpoint, then wait for T&T's
// real 30-s poll and check the reply carries the last serial we printed.
// The serial catalog, ledger and production run are never touched.
// ─────────────────────────────────────────────────────────────────────────────

export interface TntStage { id: "endpoint" | "client" | "config" | "print" | "codes" | "poll"; ok: boolean | null; detail: string }

type TntApi = NonNullable<Window["electronAPI"]>["tnt"];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor<T>(fn: () => Promise<T | null | undefined | false>, timeoutMs: number, signal?: AbortSignal): Promise<T | null> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (signal?.aborted) return null;
    const v = await fn();
    if (v) return v as T;
    await sleep(500);
  }
  return null;
}

interface PrintJson { prodLine?: string; alphaYear?: string; julian?: string; serialValue?: number; continueCount?: boolean; error?: string }

export async function runLiveTnt(opts: {
  codes: number; trigger?: TriggerMode; waitMs?: number; pollWaitMs?: number;
  log: (e: LiveLogEntry) => void; onStage: (s: TntStage) => void; onProgress: (done: number, total: number) => void; signal?: AbortSignal;
}): Promise<LiveStepResult> {
  const { log, onStage, signal } = opts;
  const waitMs = opts.waitMs ?? 180_000;
  const fail = (id: TntStage["id"], detail: string): LiveStepResult => { onStage({ id, ok: false, detail }); return { ok: false, detail }; };
  const safety = safetyCheck();
  if (!safety.ok) return safety;
  if (!twinDispatcher.isBound()) return { ok: false, detail: "The printer pair is not linked — run step 3 first." };
  const tnt: TntApi | undefined = (typeof window !== "undefined" ? window.electronAPI?.tnt : undefined);
  if (!tnt) return fail("endpoint", "The real Track-n-Trace connection only exists in the installed desktop app (not in the browser preview).");

  // 1. Endpoint listening
  let st = await tnt.getState();
  if (!st.listening) {
    const cfg = await tnt.getConfig();
    log({ t: now(), dir: "CodeSync", text: `Track-n-Trace endpoint was off — starting it on port ${cfg.port || 8101}` });
    await tnt.setConfig({ enabled: true, port: cfg.port || 8101 });
    st = (await waitFor(async () => { const s = await tnt.getState(); return s.listening ? s : null; }, 5000, signal)) ?? st;
  }
  if (!st.listening) return fail("endpoint", `Endpoint could not listen on port ${st.port}${st.lastError ? ` — ${st.lastError}` : ""}. Check nothing else uses that port and the firewall allows it.`);
  onStage({ id: "endpoint", ok: true, detail: `Listening on port ${st.port}` });

  // 2. Real T&T PC connected
  onStage({ id: "client", ok: null, detail: `Waiting for the Track-n-Trace PC to connect to this PC on port ${st.port}…` });
  const conn = await waitFor(async () => { const s = await tnt.getState(); return s.connected ? s : null; }, waitMs, signal);
  if (!conn) return fail("client", signal?.aborted ? "Stopped by operator" : `No Track-n-Trace connection within ${waitMs / 1000} s. Check the T&T PC points at this PC's IP, port ${st.port}.`);
  onStage({ id: "client", ok: true, detail: `Connected from ${conn.peer ?? "unknown"}` });
  log({ t: now(), dir: "T&T→CodeSync", text: `TCP connected from ${conn.peer ?? "?"}` });

  // 3. Config received + acknowledged
  onStage({ id: "config", ok: null, detail: "Waiting for Track-n-Trace to send its Config message…" });
  const cfgSt = await waitFor(async () => {
    const s = await tnt.getState();
    const ack = s.recent.some((f) => f.dir === "out" && f.name.toUpperCase().includes("CONFIG"));
    return s.printerSettings && ack ? s : null;
  }, waitMs, signal);
  if (!cfgSt) return fail("config", signal?.aborted ? "Stopped by operator" : "No valid Config received/acknowledged. If T&T sent one, it may have been rejected — check the uplink log.");
  const ps = cfgSt.printerSettings!;
  const fl = (f: typeof ps.printer1) => f ? [f.inverted && "inverted", f.reversed && "reversed", f.bold && "bold"].filter(Boolean).join("+") || "normal" : "—";
  onStage({ id: "config", ok: true, detail: `Config received and acknowledged · P1 ${fl(ps.printer1)} · P2 ${fl(ps.printer2)}` });
  log({ t: now(), dir: "T&T→CodeSync", text: `CONFIG ok · P1 ${fl(ps.printer1)} · P2 ${fl(ps.printer2)} · ACK sent` });

  // 4. Print message received
  onStage({ id: "print", ok: null, detail: "Waiting for Track-n-Trace to send a Print message (start a test lot on T&T)…" });
  const pr = await waitFor(async () => {
    const s = await tnt.getState();
    const f = [...s.recent].reverse().find((x) => x.dir === "in" && x.name.toUpperCase().includes("PRINT"));
    const j = f?.json as PrintJson | undefined;
    return j && !j.error && j.prodLine ? { j, lastSerial: s.lastSerial ?? 0 } : null;
  }, waitMs, signal);
  if (!pr) return fail("print", signal?.aborted ? "Stopped by operator" : "No valid Print message received from Track-n-Trace.");
  const fields = { prodLine: pr.j.prodLine!, alphaYear: pr.j.alphaYear!, julian: pr.j.julian! };
  const start = pr.j.continueCount ? (pr.lastSerial >= SERIAL_MAX ? 1 : pr.lastSerial + 1) : pr.j.serialValue!;
  const q = new TwinPairQueue(() => {}, () => {});
  try { q.start(fields, start); } catch (e) { return fail("print", `Print message gives an invalid code: ${(e as Error).message}`); }
  const first = q.queued[0].code;
  const v = validatePrintedCode(first);
  if ("error" in v) return fail("print", v.error);
  onStage({ id: "print", ok: true, detail: `Print message valid · line ${fields.prodLine} · year ${fields.alphaYear} · day ${fields.julian} · ${pr.j.continueCount ? "continue count" : "new count"} · first code ${first}` });
  log({ t: now(), dir: "T&T→CodeSync", text: `PRINT ok · first code ${first}` });

  // 5. Print N real codes (photocell-released by default)
  const trig = opts.trigger ?? "photocell";
  onStage({ id: "codes", ok: null, detail: trig === "photocell" ? "Send products past the photocell — one code per product." : "Printing…" });
  let printed = 0;
  while (printed < opts.codes) {
    if (signal?.aborted) return fail("codes", `Stopped by operator after ${printed}/${opts.codes}`);
    const head = q.queued[0];
    log({ t: now(), dir: "CodeSync→P1+P2", text: head.code + waitNote(trig) });
    const r = await twinDispatcher.dispatch(head.code, dispatchOpts(trig));
    if (!r.aReason) q.confirm(1 as PrinterSlot, head.serial);
    if (!r.bReason) q.confirm(2 as PrinterSlot, head.serial);
    if (!r.ok) {
      await logRecentCommands(log);
      return fail("codes", `Held at ${head.code}: ${r.reason}${/timeout/i.test(r.reason ?? "") && trig === "photocell" ? " (no product reached the photocell in time?)" : ""}. ${printed}/${opts.codes} printed — nothing skipped.`);
    }
    await tnt.setLastSerial?.(head.serial);
    printed++;
    opts.onProgress(printed, opts.codes);
    log({ t: now(), dir: "P1+P2→CodeSync", text: `printed ${head.code} on both · reported serial ${head.serial} to T&T link` });
  }
  const last = q.lastSerial;
  onStage({ id: "codes", ok: true, detail: `${printed} codes printed on both printers · last serial ${last}` });

  // 6. Real 30-s poll returns the last printed serial
  const pollWait = opts.pollWaitMs ?? 45_000;
  onStage({ id: "poll", ok: null, detail: `Waiting for Track-n-Trace's status poll (every 30 s, up to ${pollWait / 1000} s)…` });
  let reply: number | null = null;
  const off = tnt.onFrame((f) => {
    if (f.dir === "out" && f.name.toUpperCase().includes("REQUEST")) {
      const ls = (f.json as { lastSerial?: number } | null)?.lastSerial;
      if (typeof ls === "number") reply = ls;
    }
  });
  await waitFor(async () => reply !== null, pollWait, signal);
  off();
  if (reply === null) return fail("poll", signal?.aborted ? "Stopped by operator" : `No status poll from Track-n-Trace within ${pollWait / 1000} s.`);
  if (reply !== last) return fail("poll", `Poll reply said last serial ${reply}, but ${last} was printed.`);
  onStage({ id: "poll", ok: true, detail: `T&T polled and was told last serial ${reply} — matches the printed code` });
  log({ t: now(), dir: "CodeSync→T&T", text: `LAST SERIAL ${reply} ✓` });
  return { ok: true, detail: `Real Track-n-Trace link validated: connected, Config + Print accepted, ${printed} codes printed on both printers, poll reply correct (serial ${last}).` };
}
