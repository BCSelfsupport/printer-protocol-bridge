/**
 * Twin Code — bonded 2-printer mode for catalog-fed 13-digit serials.
 * Build Remote: this module is fully isolated from v0.1.166 surface.
 *
 * All timestamps use performance.now() (high-resolution monotonic ms).
 */

export type BottleStage =
  | "ingress"      // T1 - T0  (catalog dispense / external feed → reserved)
  | "dispatch"    // T2 - T1  (reserved → wire send)
  | "wireA"       // T3a - T2a (printer A round-trip)
  | "wireB"       // T3b - T2b (printer B round-trip)
  | "skew"        // |T3a - T3b|
  | "cycle";      // T4 - T0

export interface BottleSample {
  /** Monotonic bottle index since profiler started (or replay loaded). */
  index: number;
  /** Serial dispensed/printed for this bottle. null = miss-print. */
  serial: string | null;
  /** Outcome. */
  outcome: "printed" | "missed";

  // Raw timestamps (performance.now() ms, relative to profiler start)
  t0: number;
  t1: number;
  t2a: number;
  t2b: number;
  t3a: number;
  t3b: number;
  t4: number;

  // Derived (all ms)
  ingressMs: number;
  dispatchMs: number;
  wireAMs: number;
  wireBMs: number;
  skewMs: number;
  cycleMs: number;
}

export interface ProfilerSession {
  id: string;
  startedAt: number;     // wall-clock epoch ms
  endedAt: number | null;
  label: string;
  samples: BottleSample[];
}
