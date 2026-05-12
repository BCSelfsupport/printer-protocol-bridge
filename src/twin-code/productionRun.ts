/**
 * Twin Code — Production Run + Audit Ledger
 * ------------------------------------------
 * Wraps a bonded printing session into a named, auditable batch ("Run").
 *
 * Customer-facing purpose:
 *   - Lock production to a Lot # + Operator + start/stop timestamps.
 *   - Maintain an append-only audit trail of every dispatched bottle.
 *   - On Stop, freeze the run so a CSV/JSON audit can be exported and
 *     handed to a regulator (METRC, FDA-style).
 *
 * Data sources (no duplication):
 *   - The Catalog already records each printed/missed bottle with a wall-clock
 *     timestamp. The ProductionRun does NOT shadow that data — it captures the
 *     INDEX into `catalog.getRecords()` at start, and on stop slices out
 *     [startIdx, endIdx) for the run's audit trail.
 *
 * Tamper-evidence:
 *   - Each export is hashed (SHA-256) with a Merkle-style chain over the
 *     ordered audit lines. The hash + run metadata + record count are
 *     embedded in the JSON export so any later edit invalidates the chain.
 *
 * Persistence:
 *   - Active run is mirrored to localStorage so a refresh doesn't lose the
 *     batch boundary. Completed runs are NOT stored long-term (the export is
 *     the artifact). The last 5 completed runs are kept in-memory for quick
 *     re-export from the same browser session.
 */

import { catalog, type LedgerRecord } from "./catalog";
import { faultGuard } from "./faultGuard";
import { cloudLedger } from "./cloudLedger";
import { liveMetrics } from "./liveMetrics";
import { conveyorSim } from "./conveyorSim";
import {
  twinDispatcher,
  TWIN_DEFAULT_WIDTH,
  TWIN_DEFAULT_DELAY,
  TWIN_DEFAULT_SPEED_CODE,
  TWIN_DEFAULT_SPEED_LABEL,
} from "./twinDispatcher";
import { profilerBus } from "./profilerBus";
import { computeHeadroom, cycleBudgetForBpm, DEFAULT_SAFETY_FACTOR } from "./throughputHeadroom";
import { twinPairStore } from "./twinPairStore";
import { autoCodeSerial } from "./autoCodeSerial";

const ACTIVE_RUN_KEY = "twincode.activeRun.v1";

export interface ProductionRunMeta {
  /** UUID-style id for the run (browser-local). */
  id: string;
  lotNumber: string;
  operator: string;
  /** Optional free-text note for the audit (line, shift, comment). */
  note: string;
  /** Wall-clock epoch ms when Start was pressed. */
  startedAt: number;
  /** Wall-clock epoch ms when Stop was pressed. null = still active. */
  endedAt: number | null;
  /** Catalog fingerprint at the moment of Start. */
  catalogFingerprint: string | null;
  /** Catalog total at the moment of Start. */
  catalogTotalAtStart: number;
  /** Index into catalog.getRecords() at the moment of Start. */
  recordsStartIdx: number;
  /** Index into catalog.getRecords() at the moment of Stop. null = still active. */
  recordsEndIdx: number | null;
  /** True if LIVE bonded mode was engaged at Start (vs synthetic). */
  liveAtStart: boolean;
  /** Cloud-side run id (if successfully registered). */
  cloudRunId?: string | null;
  /**
   * Optional run-length cap. When set, the run auto-stops as soon as
   * (printed + missed) reaches this number — even if the catalog still has
   * serials available. Null/0 means "run until catalog is exhausted".
   */
  targetCount?: number | null;
  /**
   * Snapshot of the conveyor / line conditions at the moment of Start.
   * The envelope report reads from this so the audit always shows what the
   * line was actually doing for THIS lot — not whatever the conveyorSim
   * happens to be configured to when the operator later clicks Download.
   * (Fixes report showing stale ft/min after operator nudges line speed.)
   */
  lineSnapshot?: {
    ftPerMin: number;
    pitchMm: number;
  } | null;
  /**
   * Snapshot of the printer print-parameter defaults applied at bind time.
   * These three settings dominate cycle time (Speed sets dot rate, Width
   * stretches/compresses the print, Delay is dead time before each strike),
   * so they're recorded with the run for proper apples-to-apples comparison
   * across BPM tests.
   */
  printSnapshot?: {
    widthDots: number;
    delayDots: number;
    speedCode: number;
    speedLabel: string;
    /**
     * Live AS-RUN values queried from each printer at Stop. In real production
     * the operator nails Delay/Width on the line after bind (Delay positions
     * the print on the bottle relative to the photocell, Width tunes strike
     * width to line speed) — these are the values that actually shaped THIS
     * lot's cycle time. The bind defaults stay alongside as the baseline.
     */
    liveAtStop?: {
      a: { widthDots: number | null; delayDots: number | null } | null;
      b: { widthDots: number | null; delayDots: number | null } | null;
    } | null;
  } | null;
  /**
   * Catalog segments consumed by this run. The first segment is captured at
   * Start. Each subsequent on-deck CSV that auto-promotes mid-run appends a
   * new segment with the bottle index at which the swap took effect, so the
   * audit export can show "bottles 1–998_412 came from CSV-A (fp=…), bottles
   * 998_413–1_996_775 came from CSV-B (fp=…)" without losing forensic detail
   * across midnight rollover.
   */
  catalogSegments?: Array<{
    fingerprint: string;
    /** Catalog total at the moment this segment was active. */
    catalogTotalAtSwap: number;
    /** Records-array index when this segment took effect. */
    recordsIdxAtSwap: number;
    /** Wall-clock ms when this segment took effect. */
    swappedAtMs: number;
  }>;
}

export interface ProductionRunSummary {
  printed: number;
  missed: number;
  total: number;
  yieldPct: number;
  /** Wall-clock duration in seconds. Uses Date.now() if still active. */
  elapsedSec: number;
}

export interface ProductionRunExport {
  /** Format version — bump if the export shape ever changes. */
  v: 1;
  meta: ProductionRunMeta;
  summary: ProductionRunSummary;
  /** Ordered audit lines — one per dispatched bottle. */
  records: LedgerRecord[];
  /** SHA-256 hex over the JSON-serialized records. */
  recordsHash: string;
  /** SHA-256 hex over `meta + summary + recordsHash` — the "signature". */
  documentHash: string;
  /** ISO timestamp of when this export was generated. */
  exportedAt: string;
}

type Listener = (state: ProductionRunState) => void;

export interface ProductionRunState {
  active: ProductionRunMeta | null;
  /** Last completed run, if any (kept in memory only). */
  lastCompleted: ProductionRunExport | null;
}

class ProductionRunStore {
  private state: ProductionRunState = { active: null, lastCompleted: null };
  private listeners = new Set<Listener>();
  /** Unsubscribe handle for the catalog-exhaustion watcher (active runs only). */
  private catalogUnsub: (() => void) | null = null;
  /** Optional UI hook: notified when an active run auto-stops because the
   *  catalog hit zero. The HUD wires this to a toast + auto-download of the
   *  signed export so the operator gets immediate end-of-lot artifacts. */
  private onAutoStop: ((exp: ProductionRunExport) => void) | null = null;

  constructor() {
    this.restoreActive();
    // If a run was restored from disk, re-arm the catalog watcher.
    if (this.state.active) {
      this.armCatalogWatcher();
      // NOTE: gate counter starts fresh — on a refresh mid-run we cannot
      // recover how many bottles were already issued, so the gate would
      // allow up to `targetCount` MORE bottles. Acceptable tradeoff: the
      // catalog ledger is still authoritative for accounting.
      this.installDispatchGate(this.state.active);
    }
  }

  /** Register a callback for "run auto-stopped because catalog is empty". */
  setAutoStopHandler(fn: ((exp: ProductionRunExport) => void) | null) {
    this.onAutoStop = fn;
  }

  getState(): ProductionRunState { return this.state; }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.state);
    return () => { this.listeners.delete(fn); };
  }

  /** Begin a new run. Throws if one is already active. */
  start(input: { lotNumber: string; operator: string; note?: string; liveAtStart: boolean; targetCount?: number | null }): ProductionRunMeta {
    if (this.state.active) {
      throw new Error("A production run is already active — stop it before starting another.");
    }
    const cs = catalog.getState();
    const meta: ProductionRunMeta = {
      id: cryptoRandomId(),
      lotNumber: input.lotNumber.trim(),
      operator: input.operator.trim(),
      note: (input.note ?? "").trim(),
      startedAt: Date.now(),
      endedAt: null,
      catalogFingerprint: cs.fingerprint,
      catalogTotalAtStart: cs.total,
      recordsStartIdx: catalog.getRecords().length,
      recordsEndIdx: null,
      liveAtStart: input.liveAtStart,
      cloudRunId: null,
      targetCount: input.targetCount && input.targetCount > 0 ? Math.floor(input.targetCount) : null,
      lineSnapshot: (() => {
        const cv = conveyorSim.getConfig();
        return cv ? { ftPerMin: cv.ftPerMin, pitchMm: cv.pitchMm } : null;
      })(),
      // Twin Code defaults pushed to both printers on bind. Snapshotted so
      // the report can show the print params that were ACTUALLY in effect —
      // critical for tying cycle-time numbers back to a hardware config.
      printSnapshot: input.liveAtStart ? {
        widthDots: TWIN_DEFAULT_WIDTH,
        delayDots: TWIN_DEFAULT_DELAY,
        speedCode: TWIN_DEFAULT_SPEED_CODE,
        speedLabel: TWIN_DEFAULT_SPEED_LABEL,
      } : null,
      catalogSegments: cs.fingerprint
        ? [{
            fingerprint: cs.fingerprint,
            catalogTotalAtSwap: cs.total,
            recordsIdxAtSwap: catalog.getRecords().length,
            swappedAtMs: Date.now(),
          }]
        : [],
    };
    this.state = { ...this.state, active: meta };
    // Fresh run = fresh fault history; otherwise prior shift's incidents
    // would muddy the new lot's recovery banner.
    faultGuard.reset();
    // Fresh run = fresh BPM rolling window so the gauge reflects this lot
    // only, not whatever happened before Start.
    liveMetrics.resetWindow();
    // Fresh run = bottle #1, not #299 from leftover session counter.
    // The "Resume from bottle #N" banner reads the conveyor's bottle id, so
    // resetting here keeps the operator-facing number aligned with this lot.
    conveyorSim.resetBottleCounter();
    // Auto-Code Mode: align the host counter mirror with the printer's freshly-
    // seeded counter slot start so the LID DataMatrix encodes the same serial
    // the SIDE prints natively for bottle #1.
    if (twinPairStore.getState().autoCodeMode) {
      autoCodeSerial.reset();
    }
    // Install the pre-dispatch gate so the conveyor stops issuing serials the
    // INSTANT the target is reached — keeps A and B printer counters in
    // lock-step at end-of-lot (no extra ^MD slips through to A while B is
    // being torn down). When targetCount is null/0, no gate is installed and
    // the run runs until the catalog itself is exhausted.
    this.installDispatchGate(meta);
    this.persistActive();
    this.notify();
    // Watch the catalog so the run auto-finalizes on the last bottle.
    this.armCatalogWatcher();
    // Register the run in the cloud (best-effort). If it succeeds we attach
    // the cloud id so subsequent ledger writes correlate.
    cloudLedger.startRun({
      lotNumber: meta.lotNumber,
      operator: meta.operator,
      note: meta.note || null,
      catalogFingerprint: meta.catalogFingerprint,
      catalogTotalAtStart: meta.catalogTotalAtStart,
      liveAtStart: meta.liveAtStart,
    }).then((res) => {
      if (res && this.state.active && this.state.active.id === meta.id) {
        const updated = { ...this.state.active, cloudRunId: res.id };
        this.state = { ...this.state, active: updated };
        catalog.setActiveRunId(res.id);
        this.persistActive();
        this.notify();
      }
    }).catch(() => { /* best-effort */ });
    return meta;
  }

  /**
   * Stop the active run, slice out its audit window, and produce a
   * tamper-evident export. The active slot is cleared.
   *
   * CRITICAL: this halts the conveyor sim FIRST, before any await, so no
   * additional bottles can cross the photocell while we're sealing the run.
   * Previously the bar's onAutoStop handler was responsible for stopping
   * the conveyor, which left a window where 100+ extra bottles could fly
   * past the beam (causing the "50-print run, 174 bottles dispatched" bug).
   */
  async stop(): Promise<ProductionRunExport | null> {
    const active = this.state.active;
    if (!active) return null;
    // Halt the bottle generator IMMEDIATELY, synchronously, before we await
    // anything. This guarantees no more photocell crossings between "run is
    // ending" and "run is sealed".
    try { conveyorSim.stop(); } catch { /* ignore */ }
    // Also disarm the fault-recovery auto-resume — when the run is over,
    // an inbound fault must NOT silently restart the line.
    faultGuard.reset();
    const endedAt = Date.now();
    const recordsEndIdx = catalog.getRecords().length;
    // Snapshot live ^PW / ^DA off the printers BEFORE we tear down the bond,
    // so the report shows the values the operator actually settled on for this
    // lot — not just the defaults pushed at bind. Best-effort; failure leaves
    // the report falling back to the bind baseline.
    let liveAtStop: NonNullable<NonNullable<ProductionRunMeta['printSnapshot']>['liveAtStop']> = null;
    if (active.liveAtStart && twinDispatcher.isBound()) {
      try {
        const live = await twinDispatcher.fetchLivePrintParams();
        if (live) liveAtStop = { a: live.a, b: live.b };
      } catch { /* ignore */ }
    }
    const meta: ProductionRunMeta = {
      ...active,
      endedAt,
      recordsEndIdx,
      printSnapshot: active.printSnapshot
        ? { ...active.printSnapshot, liveAtStop }
        : active.printSnapshot,
    };
    const records = catalog.getRecords().slice(meta.recordsStartIdx, recordsEndIdx);
    const summary = computeSummary(meta, records, endedAt);
    const recordsHash = await sha256Hex(JSON.stringify(records));
    const documentHash = await sha256Hex(JSON.stringify({ meta, summary, recordsHash }));
    const exportObj: ProductionRunExport = {
      v: 1,
      meta,
      summary,
      records,
      recordsHash,
      documentHash,
      exportedAt: new Date().toISOString(),
    };
    this.state = { active: null, lastCompleted: exportObj };
    this.clearPersistedActive();
    this.disarmCatalogWatcher();
    this.clearDispatchGate();
    this.notify();
    catalog.setActiveRunId(null);
    if (active.cloudRunId) {
      cloudLedger.stopRun({
        runId: active.cloudRunId,
        printedCount: summary.printed,
        missedCount: summary.missed,
      }).catch(() => { /* best-effort */ });
    }
    return exportObj;
  }

  /** Force-cancel the active run with NO export (ditches the boundary). */
  cancel() {
    const active = this.state.active;
    if (!active) return;
    // Halt the line BEFORE clearing the active marker, otherwise the conveyor
    // keeps spawning bottles into a "no run active" void.
    try { conveyorSim.stop(); } catch { /* ignore */ }
    try { faultGuard.reset(); } catch { /* ignore */ }
    this.state = { ...this.state, active: null };
    this.clearPersistedActive();
    this.disarmCatalogWatcher();
    this.clearDispatchGate();
    this.notify();
    catalog.setActiveRunId(null);
    if (active.cloudRunId) {
      const sum = computeSummary(active, catalog.getRecords().slice(active.recordsStartIdx), Date.now());
      cloudLedger.stopRun({
        runId: active.cloudRunId,
        printedCount: sum.printed,
        missedCount: sum.missed,
      }).catch(() => { /* best-effort */ });
    }
  }

  /** Dismiss the completed-run banner WITHOUT touching the catalog ledger.
   *  The audit artifacts have already been downloaded; this just clears the UI. */
  dismissCompleted() {
    if (!this.state.lastCompleted) return;
    this.state = { ...this.state, lastCompleted: null };
    this.notify();
  }

  /**
   * Hard reset for "start over from scratch": ditches any active run, clears
   * the completed banner, resets the catalog progress (so all 1,000 serials
   * are available again), zeroes the conveyor's bottle counter, clears fault
   * history, and stops the conveyor sim. Equivalent to a clean app boot
   * without dropping the loaded CSV.
   */
  resetAll() {
    // Stop the line FIRST and clear in-flight bottles so a stale belt can't
    // spew prints the moment something restarts the conveyor.
    try { conveyorSim.stop(); } catch { /* ignore */ }
    try { conveyorSim.reset(); } catch { /* ignore */ }
    if (this.state.active) this.cancel();
    this.state = { ...this.state, lastCompleted: null };
    this.notify();
    catalog.reset();          // wipes printedSet + records, keeps loaded entries
    faultGuard.reset();
    liveMetrics.resetWindow();
    conveyorSim.resetBottleCounter();
  }

  /** Live summary of the active run (or null if none). */
  liveSummary(): ProductionRunSummary | null {
    const active = this.state.active;
    if (!active) return null;
    const records = catalog.getRecords().slice(active.recordsStartIdx);
    return computeSummary(active, records, Date.now());
  }

  // --- internals ---

  /**
   * While a run is active, watch the catalog for end-of-lot. When the catalog
   * has been fully consumed (and at least one bottle in this run has been
   * dispatched, so an empty catalog at start doesn't self-terminate), seal the
   * run, hand the export to the UI hook for download, and disarm.
   */
  private armCatalogWatcher() {
    if (this.catalogUnsub) return;
    let firing = false;
    this.catalogUnsub = catalog.subscribe((cs) => {
      const active = this.state.active;
      if (!active) return;
      if (firing) return;

      // Detect mid-run catalog promotions (on-deck queue auto-appended a new
      // CSV). The fingerprint changes whenever appendSerials() runs; record a
      // new segment so the audit can show which bottles came from which file.
      const segs = active.catalogSegments ?? [];
      const lastSegFp = segs.length > 0 ? segs[segs.length - 1].fingerprint : null;
      if (cs.fingerprint && cs.fingerprint !== lastSegFp) {
        const updated: ProductionRunMeta = {
          ...active,
          catalogSegments: [
            ...segs,
            {
              fingerprint: cs.fingerprint,
              catalogTotalAtSwap: cs.total,
              recordsIdxAtSwap: catalog.getRecords().length,
              swappedAtMs: Date.now(),
            },
          ],
        };
        this.state = { ...this.state, active: updated };
        this.persistActive();
        this.notify();
      }

      const recordsConsumed = catalog.getRecords().length - active.recordsStartIdx;

      // (1) Run-length cap reached?
      // Count PRINTS only toward the target — operators ask for "50 codes",
      // not "50 attempts". A run with target=50 + 5 misses must produce 50
      // valid prints, not stop at 45 prints just because 5 bottles missed.
      let printedInRun = 0;
      if (active.targetCount != null && active.targetCount > 0) {
        const slice = catalog.getRecords().slice(active.recordsStartIdx);
        for (const r of slice) if (r.outcome === "printed") printedInRun++;
      }
      const targetReached =
        active.targetCount != null &&
        active.targetCount > 0 &&
        printedInRun >= active.targetCount;

      // (2) Catalog fully consumed?
      const catalogExhausted =
        cs.total > 0 && cs.nextIndex >= cs.total && recordsConsumed > 0;

      if (!targetReached && !catalogExhausted) return;

      firing = true;
      // Stop the conveyor synchronously RIGHT NOW so no more bottles cross
      // the beam while we await the SHA-256 export. (stop() will also call
      // this, but doing it here closes the gap between "watcher fires" and
      // "stop() actually runs.")
      try { conveyorSim.stop(); } catch { /* ignore */ }
      // Defer one tick so the catalog notify loop completes cleanly.
      Promise.resolve().then(async () => {
        try {
          const exp = await this.stop();
          if (exp && this.onAutoStop) this.onAutoStop(exp);
        } finally {
          firing = false;
        }
      });
    });
  }

  private disarmCatalogWatcher() {
    if (this.catalogUnsub) {
      this.catalogUnsub();
      this.catalogUnsub = null;
    }
  }

  /**
   * Install a pre-dispatch gate on the conveyor sim that lets exactly
   * `targetCount` bottles through (or unlimited when not set). The gate
   * accounts internally so a stop-latency on the watcher cannot leak an
   * extra ^MD to printer A.
   */
  private installDispatchGate(meta: ProductionRunMeta) {
    if (!meta.targetCount || meta.targetCount <= 0) {
      conveyorSim.setDispatchGate(null);
      return;
    }
    let issued = 0;
    const cap = meta.targetCount;
    conveyorSim.setDispatchGate(() => {
      if (issued >= cap) return false;
      issued++;
      return true;
    });
  }

  private clearDispatchGate() {
    try { conveyorSim.setDispatchGate(null); } catch { /* ignore */ }
  }

  private persistActive() {
    try {
      if (this.state.active) {
        localStorage.setItem(ACTIVE_RUN_KEY, JSON.stringify(this.state.active));
      }
    } catch { /* ignore */ }
  }

  private clearPersistedActive() {
    try { localStorage.removeItem(ACTIVE_RUN_KEY); } catch { /* ignore */ }
  }

  private restoreActive() {
    try {
      const raw = localStorage.getItem(ACTIVE_RUN_KEY);
      if (!raw) return;
      const meta = JSON.parse(raw) as ProductionRunMeta;
      if (meta && meta.id && meta.lotNumber) {
        this.state = { ...this.state, active: meta };
        if (meta.cloudRunId) catalog.setActiveRunId(meta.cloudRunId);
      }
    } catch { /* ignore */ }
  }

  private notify() {
    this.listeners.forEach((l) => l(this.state));
  }
}

function computeSummary(meta: ProductionRunMeta, records: LedgerRecord[], nowMs: number): ProductionRunSummary {
  let printed = 0;
  let missed = 0;
  for (const r of records) {
    if (r.outcome === "printed") printed++;
    else if (r.outcome === "missed") missed++;
  }
  const total = printed + missed;
  const yieldPct = total === 0 ? 100 : (printed / total) * 100;
  const endRef = meta.endedAt ?? nowMs;
  const elapsedSec = Math.max(0, Math.round((endRef - meta.startedAt) / 1000));
  return { printed, missed, total, yieldPct, elapsedSec };
}

function cryptoRandomId(): string {
  // crypto.randomUUID is available in all modern browsers + Electron.
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback (should never hit in our targets).
  return "run-" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

async function sha256Hex(text: string): Promise<string> {
  const enc = new TextEncoder().encode(text);
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const buf = await crypto.subtle.digest("SHA-256", enc);
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  // Cheap non-cryptographic fallback for the exceptionally rare no-WebCrypto env.
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return "fallback-" + (h >>> 0).toString(16);
}

// ---------- Export helpers (CSV + JSON file download) ----------

export function downloadRunCSV(exp: ProductionRunExport) {
  const headers = [
    "bottleIndex",
    "outcome",
    "serial",
    "wallTimestampISO",
    "wallTimestampEpochMs",
  ];

  // --- Snapshot the run conditions so the recipient can read them without
  //     having to ask. These are captured at EXPORT time (after stop), which
  //     is fine — they describe the test rig, not per-bottle state.
  const live = liveMetrics.getSnapshot();
  const cvLive = conveyorSim.getConfig();
  const cv = exp.meta.lineSnapshot
    ? { ...cvLive, ftPerMin: exp.meta.lineSnapshot.ftPerMin, pitchMm: exp.meta.lineSnapshot.pitchMm }
    : cvLive;
  const profile = twinDispatcher.getBoundProfile();
  const samples = profilerBus.getSamples();
  const headroom = computeHeadroom(samples, live.bpm);
  const budget50 = cycleBudgetForBpm(50);
  const budget100 = cycleBudgetForBpm(100);
  const budget200 = cycleBudgetForBpm(200);
  const budget300 = cycleBudgetForBpm(300);

  const lines: string[] = [
    `# Twin Code — Production Run Audit`,
    `#`,
    `# === Run identity ===`,
    `# Lot: ${exp.meta.lotNumber}`,
    `# Operator: ${exp.meta.operator}`,
    `# Note: ${exp.meta.note || ""}`,
    `# Started: ${new Date(exp.meta.startedAt).toISOString()}`,
    `# Ended: ${exp.meta.endedAt ? new Date(exp.meta.endedAt).toISOString() : ""}`,
    `# Duration: ${exp.summary.elapsedSec}s`,
    `# Mode: ${exp.meta.liveAtStart ? "LIVE bonded" : "Synthetic"}`,
    `#`,
    `# === Line conditions ===`,
    `# Line speed: ${cv.ftPerMin} ft/min`,
    `# Pitch (centre-to-centre): ${cv.pitchMm} mm`,
    `# Bottle Ø (configured): ${live.bottleDiameterMm} mm`,
    `# Gap (pitch − Ø): ${Math.max(0, cv.pitchMm - live.bottleDiameterMm).toFixed(1)} mm`,
    `# Conveyor BPM (model): ${((cv.ftPerMin * 304.8 / 60) / cv.pitchMm * 60).toFixed(1)}`,
    `# Measured BPM (rolling 60s avg): ${live.bpm.toFixed(1)}`,
    `#`,
    `# === Twin pair binding ===`,
    `# A side subcommand: ^MD^${profile?.subA ?? "?"} (${profile?.subA === "BD" ? "DataMatrix native" : "Text"})`,
    `# B side subcommand: ^MD^${profile?.subB ?? "?"} (${profile?.subB === "BD" ? "DataMatrix native" : "Text"})`,
    `# DataMatrix on either side: ${profile?.hasBarcode ? "YES" : "NO"}`,
    `#`,
    `# === Print parameters (applied at bind — affect cycle time / max BPM) ===`,
    `# Width (^PW) [bind default]: ${exp.meta.printSnapshot?.widthDots ?? "n/a"} dots`,
    `# Delay (^DA) [bind default]: ${exp.meta.printSnapshot?.delayDots ?? "n/a"} dots`,
    `# Speed (^CM s)              : ${exp.meta.printSnapshot?.speedCode ?? "n/a"} (${exp.meta.printSnapshot?.speedLabel ?? "n/a"})`,
    ...(exp.meta.printSnapshot?.liveAtStop ? [
      `#`,
      `# === Live AS-RUN print parameters (queried from printers at Stop) ===`,
      `# A side  Width: ${exp.meta.printSnapshot.liveAtStop.a?.widthDots ?? "n/a"} dots  Delay: ${exp.meta.printSnapshot.liveAtStop.a?.delayDots ?? "n/a"} dots`,
      `# B side  Width: ${exp.meta.printSnapshot.liveAtStop.b?.widthDots ?? "n/a"} dots  Delay: ${exp.meta.printSnapshot.liveAtStop.b?.delayDots ?? "n/a"} dots`,
      `# Note: in production Delay is set live from the conveyor (placement of`,
      `#   the print on the bottle after the photocell) and Width is tuned to`,
      `#   the line speed / pitch — so these may differ from the bind defaults.`,
      `#   Cycle-time numbers in this run reflect the AS-RUN values above.`,
    ] : []),
    `#`,
    `# === Throughput envelope (this run) ===`,
    `# Cycle p95 (measured, n=${headroom.sampleCount}): ${Number.isFinite(headroom.cycleP95Ms) ? headroom.cycleP95Ms.toFixed(1) + " ms" : "n/a"}`,
    `# Max sustainable BPM (cycle p95 × ${headroom.safetyFactor}× safety): ${Number.isFinite(headroom.maxSustainableBpm) ? headroom.maxSustainableBpm.toFixed(0) : "n/a"}`,
    `# Headroom at measured BPM: ${Number.isFinite(headroom.headroomPct) ? (headroom.headroomPct >= 0 ? "+" : "") + headroom.headroomPct.toFixed(0) + "%" : "n/a"}`,
    `# Verdict: ${headroom.verdict.toUpperCase()}`,
    `# ${headroom.oneLiner}`,
    `#`,
    `# === Reference: cycle-time budgets at common target BPMs (with ${headroom.safetyFactor}× safety) ===`,
    `# Target  50 BPM → cycle must be ≤ ${budget50.toFixed(0)} ms`,
    `# Target 100 BPM → cycle must be ≤ ${budget100.toFixed(0)} ms`,
    `# Target 200 BPM → cycle must be ≤ ${budget200.toFixed(0)} ms`,
    `# Target 300 BPM → cycle must be ≤ ${budget300.toFixed(0)} ms`,
    `#`,
    `# === Outcome ===`,
    `# Printed: ${exp.summary.printed}  Missed: ${exp.summary.missed}  Yield: ${exp.summary.yieldPct.toFixed(2)}%`,
    `# Catalog fingerprint (final): ${exp.meta.catalogFingerprint ?? ""}`,
    ...((exp.meta.catalogSegments && exp.meta.catalogSegments.length > 1) ? [
      `#`,
      `# === Catalog segments (on-deck promotions consumed by this run) ===`,
      ...exp.meta.catalogSegments.map((s, i) =>
        `# [${i + 1}] fp=${s.fingerprint} catalogTotal=${s.catalogTotalAtSwap} swappedAtRecordIdx=${s.recordsIdxAtSwap} swappedAtISO=${new Date(s.swappedAtMs).toISOString()}`
      ),
    ] : []),
    `# Records SHA-256: ${exp.recordsHash}`,
    `# Document SHA-256: ${exp.documentHash}`,
    `#`,
    headers.join(","),
  ];
  for (const r of exp.records) {
    lines.push([
      r.bottleIndex.toString(),
      r.outcome,
      csvEscape(r.serial),
      new Date(r.wallAt).toISOString(),
      r.wallAt.toString(),
    ].join(","));
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  triggerDownload(blob, fileNameFor(exp, "csv"));
}

export function downloadRunJSON(exp: ProductionRunExport) {
  const blob = new Blob([JSON.stringify(exp, null, 2)], { type: "application/json" });
  triggerDownload(blob, fileNameFor(exp, "json"));
}

function csvEscape(s: string): string {
  if (s == null) return "";
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function fileNameFor(exp: ProductionRunExport, ext: string): string {
  const safeLot = exp.meta.lotNumber.replace(/[^a-zA-Z0-9._-]+/g, "_") || "lot";
  const stamp = new Date(exp.meta.startedAt).toISOString().replace(/[:.]/g, "-");
  return `twincode-run_${safeLot}_${stamp}.${ext}`;
}

function triggerDownload(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const productionRun = new ProductionRunStore();
