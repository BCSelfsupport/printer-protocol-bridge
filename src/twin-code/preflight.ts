/**
 * Twin Code — Dry-run / Pre-flight test.
 *
 * Fires N synthetic "ghost" cycles through the bonded path WITHOUT consuming
 * catalog serials and WITHOUT writing to the production-run ledger. Used
 * before committing a real batch to verify:
 *   - both printers ACK within budget
 *   - cycle and skew are within thresholds
 *   - ACK loss rate is acceptable
 *
 * Two execution modes:
 *   - LIVE: when twinDispatcher.isBound(), each cycle calls
 *     twinDispatcher.dispatch() with a "PREFLIGHT-" prefixed test serial that
 *     the firmware safely ignores at the bottle level (we just want the wire
 *     ACK timing). We do NOT touch catalog or ledger.
 *   - SYNTHETIC: no bonded pair → use the same noise/jitter model as the
 *     conveyor sim to fabricate per-side wire RTTs. Verdict is purely
 *     "the configured timings would meet the thresholds".
 *
 * Result thresholds (defaults):
 *   - success rate ≥ 95%
 *   - cycle p95 ≤ 80 ms (LIVE) / 50 ms (SYNTH)
 *   - skew p95 ≤ 20 ms
 *   - no consecutive failures > 2
 */

import { twinDispatcher } from "./twinDispatcher";

export interface PreflightCycleResult {
  index: number;
  ok: boolean;
  aMs?: number;
  bMs?: number;
  cycleMs?: number;
  skewMs?: number;
  reason?: string;
}

export interface PreflightVerdict {
  /** Overall green/red. */
  pass: boolean;
  /** "live" when issued through bonded dispatcher; "synthetic" otherwise. */
  mode: "live" | "synthetic";
  /** Total cycles attempted. */
  total: number;
  /** Cycles that resolved ok=true. */
  succeeded: number;
  /** Cycles that failed (timeout, fault, abort). */
  failed: number;
  /** Success rate as percent (0..100). */
  successPct: number;
  /** Stats over successful cycles. */
  cycle: { p50: number; p95: number; max: number; mean: number };
  skew: { p50: number; p95: number; max: number; mean: number };
  /** Longest run of consecutive failures. */
  worstStreak: number;
  /** Plain-English checklist. */
  checks: { label: string; ok: boolean; detail?: string }[];
  /** Raw per-cycle results, in order. */
  results: PreflightCycleResult[];
  /** ISO timestamp of completion. */
  finishedAt: string;
}

export interface PreflightConfig {
  /** Number of ghost cycles to fire. */
  cycles: number;
  /** Pacing between cycles (ms). */
  intervalMs: number;
  /** Acceptable success rate (percent). */
  minSuccessPct: number;
  /** Cycle p95 must be ≤ this many ms. */
  maxCycleP95Ms: number;
  /** Skew p95 must be ≤ this many ms. */
  maxSkewP95Ms: number;
  /** Reject if any consecutive-failure streak exceeds this. */
  maxConsecutiveFailures: number;
  /** Synthetic-path timing model (only used when not bound). */
  syntheticWireAMean?: number;
  syntheticWireBMean?: number;
  syntheticJitter?: number;
}

export const DEFAULT_PREFLIGHT_CONFIG: PreflightConfig = {
  cycles: 8,
  intervalMs: 120,
  minSuccessPct: 95,
  maxCycleP95Ms: 80,
  maxSkewP95Ms: 20,
  maxConsecutiveFailures: 2,
  syntheticWireAMean: 8,
  syntheticWireBMean: 6,
  syntheticJitter: 0.25,
};

export type PreflightProgress = (
  current: number,
  total: number,
  result: PreflightCycleResult,
) => void;

function nowIso() { return new Date().toISOString(); }

function noise(jitter: number): number {
  const u1 = Math.random() || 1e-9;
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return Math.max(0.1, 1 + z * jitter * 0.4);
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function summarize(values: number[]) {
  if (values.length === 0) return { p50: 0, p95: 0, max: 0, mean: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const sum = values.reduce((a, b) => a + b, 0);
  return {
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    max: sorted[sorted.length - 1],
    mean: sum / values.length,
  };
}

/** Build a unique non-colliding test serial for ghost cycles. */
function makeGhostSerial(i: number): string {
  return `PREFLIGHT-${Date.now().toString(36)}-${i.toString().padStart(3, "0")}`;
}

/**
 * Fire one synthetic cycle (no wire). Mirrors the conveyor sim's jitter model.
 */
async function runSyntheticCycle(
  index: number,
  cfg: PreflightConfig,
): Promise<PreflightCycleResult> {
  const aMean = cfg.syntheticWireAMean ?? 8;
  const bMean = cfg.syntheticWireBMean ?? 6;
  const j = cfg.syntheticJitter ?? 0.25;
  const aMs = aMean * noise(j);
  const bMs = bMean * noise(j);
  // Tiny real wait so the UI can render progress.
  await new Promise((r) => setTimeout(r, Math.max(aMs, bMs)));
  const cycleMs = Math.max(aMs, bMs) + 1.5 * noise(j);
  const skewMs = Math.abs(aMs - bMs);
  return { index, ok: true, aMs, bMs, cycleMs, skewMs };
}

async function runLiveCycle(index: number): Promise<PreflightCycleResult> {
  const t0 = performance.now();
  const r = await twinDispatcher.dispatch(makeGhostSerial(index));
  const cycleMs = r.cycleMs ?? performance.now() - t0;
  return {
    index,
    ok: r.ok,
    aMs: r.aMs,
    bMs: r.bMs,
    cycleMs,
    skewMs: r.skewMs,
    reason: r.ok ? undefined : (r.reason || r.aReason || r.bReason || "failed"),
  };
}

/**
 * Run the full pre-flight. Caller may pass an AbortSignal to cancel mid-flight.
 */
export async function runPreflight(
  config: Partial<PreflightConfig> = {},
  onProgress?: PreflightProgress,
  signal?: AbortSignal,
): Promise<PreflightVerdict> {
  const cfg: PreflightConfig = { ...DEFAULT_PREFLIGHT_CONFIG, ...config };
  const live = twinDispatcher.isBound();
  const mode: "live" | "synthetic" = live ? "live" : "synthetic";

  const results: PreflightCycleResult[] = [];

  for (let i = 0; i < cfg.cycles; i++) {
    if (signal?.aborted) break;
    const r = live ? await runLiveCycle(i + 1) : await runSyntheticCycle(i + 1, cfg);
    results.push(r);
    onProgress?.(i + 1, cfg.cycles, r);
    if (i < cfg.cycles - 1 && cfg.intervalMs > 0) {
      await new Promise((res) => setTimeout(res, cfg.intervalMs));
    }
  }

  const succeeded = results.filter((r) => r.ok).length;
  const failed = results.length - succeeded;
  const successPct = results.length === 0 ? 0 : (succeeded / results.length) * 100;

  const okCycle = results.filter((r) => r.ok && typeof r.cycleMs === "number").map((r) => r.cycleMs!);
  const okSkew = results.filter((r) => r.ok && typeof r.skewMs === "number").map((r) => r.skewMs!);
  const cycle = summarize(okCycle);
  const skew = summarize(okSkew);

  // Worst consecutive failure streak.
  let streak = 0, worst = 0;
  for (const r of results) {
    if (r.ok) streak = 0;
    else { streak++; if (streak > worst) worst = streak; }
  }

  const cycleBudget = mode === "live" ? cfg.maxCycleP95Ms : Math.min(cfg.maxCycleP95Ms, 50);

  const checks = [
    {
      label: `Success rate ≥ ${cfg.minSuccessPct}%`,
      ok: successPct >= cfg.minSuccessPct,
      detail: `${successPct.toFixed(1)}% (${succeeded}/${results.length})`,
    },
    {
      label: `Cycle p95 ≤ ${cycleBudget} ms`,
      ok: cycle.p95 <= cycleBudget,
      detail: `${cycle.p95.toFixed(1)} ms (max ${cycle.max.toFixed(1)})`,
    },
    {
      label: `Skew p95 ≤ ${cfg.maxSkewP95Ms} ms`,
      ok: skew.p95 <= cfg.maxSkewP95Ms,
      detail: `${skew.p95.toFixed(1)} ms (max ${skew.max.toFixed(1)})`,
    },
    {
      label: `No consecutive failures > ${cfg.maxConsecutiveFailures}`,
      ok: worst <= cfg.maxConsecutiveFailures,
      detail: worst === 0 ? "none" : `worst streak: ${worst}`,
    },
  ];

  const pass = checks.every((c) => c.ok) && results.length === cfg.cycles;

  return {
    pass,
    mode,
    total: results.length,
    succeeded,
    failed,
    successPct,
    cycle,
    skew,
    worstStreak: worst,
    checks,
    results,
    finishedAt: nowIso(),
  };
}
