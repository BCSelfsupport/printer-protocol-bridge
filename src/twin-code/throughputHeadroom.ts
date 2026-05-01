/**
 * Twin Code — Throughput Headroom math.
 *
 * Single source of truth for "given a measured cycle time, what BPM ceiling
 * does it impose, and how much headroom does the current line have?"
 *
 * Used by:
 *   - OperatorHUD live panel (real-time)
 *   - Production-run CSV header (snapshot at export time)
 *   - Bruce report (post-run summary)
 *
 * Math (intentionally simple — auditable on a napkin):
 *   - bottleIntervalMs(BPM) = 60_000 / BPM
 *   - To not miss a bottle, cycleMs must be ≤ bottleIntervalMs.
 *     We add a SAFETY_FACTOR (default 1.2 = 20% headroom requirement).
 *   - maxSustainableBpm = 60_000 / (cycleP95Ms × SAFETY_FACTOR)
 *   - headroomPct = (maxSustainableBpm − targetBpm) / targetBpm × 100
 *     Negative = over budget; the line cannot sustain target.
 *
 * Why p95 and not max? p95 covers 19 of every 20 bottles, which is the
 * pragmatic envelope. Using max would let one outlier veto an otherwise
 * healthy line; using mean would hide tail risk.
 */

import type { BottleSample } from "./types";

export const DEFAULT_SAFETY_FACTOR = 1.2;

export interface HeadroomResult {
  /** Measured cycle p95 used as the ceiling driver. NaN if no data. */
  cycleP95Ms: number;
  /** Sample count behind the calculation (only printed bottles). */
  sampleCount: number;
  /** Safety factor applied (1.2 = 20% buffer). */
  safetyFactor: number;
  /** Max sustainable BPM under the safety factor. NaN if no data. */
  maxSustainableBpm: number;
  /** Current measured BPM. */
  currentBpm: number;
  /** (max − current) / current × 100. NaN if no data; negative if over. */
  headroomPct: number;
  /** "ok" | "tight" | "over" — for at-a-glance UI tone. */
  verdict: "ok" | "tight" | "over" | "no-data";
  /** Human-readable one-liner suitable for tooltips and report copy. */
  oneLiner: string;
}

/** percentile over a numeric array (already-finite). */
function pct(values: number[], p: number): number {
  if (values.length === 0) return NaN;
  if (values.length === 1) return values[0];
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/** Compute headroom from a samples array + a measured BPM. */
export function computeHeadroom(
  samples: BottleSample[],
  currentBpm: number,
  safetyFactor: number = DEFAULT_SAFETY_FACTOR,
): HeadroomResult {
  const cycles = samples
    .filter((s) => s.outcome === "printed" && typeof s.cycleMs === "number" && Number.isFinite(s.cycleMs))
    .map((s) => s.cycleMs!);

  if (cycles.length === 0) {
    return {
      cycleP95Ms: NaN,
      sampleCount: 0,
      safetyFactor,
      maxSustainableBpm: NaN,
      currentBpm,
      headroomPct: NaN,
      verdict: "no-data",
      oneLiner: "No printed cycles measured yet — start a run to populate headroom.",
    };
  }

  const cycleP95Ms = pct(cycles, 0.95);
  const maxSustainableBpm = 60_000 / (cycleP95Ms * safetyFactor);
  const headroomPct = currentBpm > 0
    ? ((maxSustainableBpm - currentBpm) / currentBpm) * 100
    : Infinity;

  let verdict: HeadroomResult["verdict"];
  if (currentBpm <= 0) verdict = "ok"; // no demand → trivially headroom
  else if (headroomPct < 0) verdict = "over";
  else if (headroomPct < 15) verdict = "tight";
  else verdict = "ok";

  const oneLiner = currentBpm > 0
    ? `Measured cycle p95 ${cycleP95Ms.toFixed(0)}ms supports up to ${maxSustainableBpm.toFixed(0)} BPM ` +
      `(line running at ${currentBpm.toFixed(0)} BPM → ${headroomPct >= 0 ? "+" : ""}${headroomPct.toFixed(0)}% headroom).`
    : `Measured cycle p95 ${cycleP95Ms.toFixed(0)}ms supports up to ${maxSustainableBpm.toFixed(0)} BPM (line idle).`;

  return {
    cycleP95Ms,
    sampleCount: cycles.length,
    safetyFactor,
    maxSustainableBpm,
    currentBpm,
    headroomPct,
    verdict,
    oneLiner,
  };
}

/**
 * Given a target BPM, compute the cycle-time budget it imposes — the inverse
 * question to computeHeadroom. Used in the report to translate customer
 * requirements into the cycle-ms target the engineering team should aim for.
 */
export function cycleBudgetForBpm(
  targetBpm: number,
  safetyFactor: number = DEFAULT_SAFETY_FACTOR,
): number {
  if (targetBpm <= 0) return Infinity;
  return 60_000 / (targetBpm * safetyFactor);
}
