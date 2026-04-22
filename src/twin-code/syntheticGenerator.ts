/**
 * Twin Code — synthetic bottle generator for Phase 1a.
 *
 * Simulates a realistic bottling line with TCP jitter + occasional firmware
 * stalls so all profiler visualizations can be exercised before any real
 * printer hardware is wired in.
 *
 * Tunable parameters expose the same knobs we'll tune against real hardware,
 * so the visualizer + thresholds are validated against believable shapes.
 */

import { profilerBus } from "./profilerBus";

export interface GeneratorConfig {
  /** Target bottles per minute. */
  ratePerMin: number;
  /** Probability (0..1) of a miss-print per bottle. */
  missRate: number;
  /** Mean ingress latency (ms). */
  ingressMean: number;
  /** Mean dispatch latency (ms). */
  dispatchMean: number;
  /** Mean printer-A round-trip (ms). */
  wireAMean: number;
  /** Mean printer-B round-trip (ms). */
  wireBMean: number;
  /** Jitter ratio (0..1) applied to each stage as gaussian-ish noise. */
  jitter: number;
  /** Probability of a firmware stall per bottle (adds 50–150ms to one printer). */
  stallRate: number;
}

export const DEFAULT_GENERATOR_CONFIG: GeneratorConfig = {
  ratePerMin: 200,
  missRate: 0.005,
  ingressMean: 2,
  dispatchMean: 1.5,
  wireAMean: 8,
  wireBMean: 6,
  jitter: 0.25,
  stallRate: 0.01,
};

// Box–Muller-ish noise centered on 1.0
function noise(jitter: number): number {
  const u1 = Math.random() || 1e-9;
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return Math.max(0.1, 1 + z * jitter * 0.4);
}

function randomSerial(): string {
  let s = "";
  for (let i = 0; i < 13; i++) s += Math.floor(Math.random() * 10);
  return s;
}

export class SyntheticGenerator {
  private timer: number | null = null;
  private config: GeneratorConfig = DEFAULT_GENERATOR_CONFIG;
  private startedAtPerf = 0;

  configure(patch: Partial<GeneratorConfig>) {
    this.config = { ...this.config, ...patch };
    if (this.isRunning()) {
      // Restart with new cadence
      this.stop();
      this.start();
    }
  }

  getConfig() {
    return this.config;
  }

  isRunning() {
    return this.timer !== null;
  }

  start() {
    if (this.timer !== null) return;
    this.startedAtPerf = performance.now();
    const tick = () => {
      this.emitOne();
      const intervalMs = 60_000 / this.config.ratePerMin;
      this.timer = window.setTimeout(tick, intervalMs);
    };
    tick();
  }

  stop() {
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private emitOne() {
    const c = this.config;
    const t0 = performance.now() - this.startedAtPerf;

    const ingressMs = c.ingressMean * noise(c.jitter);
    const dispatchMs = c.dispatchMean * noise(c.jitter);
    let wireAMs = c.wireAMean * noise(c.jitter);
    let wireBMs = c.wireBMean * noise(c.jitter);

    // Periodic stall on one printer
    if (Math.random() < c.stallRate) {
      const stall = 50 + Math.random() * 100;
      if (Math.random() < 0.5) wireAMs += stall;
      else wireBMs += stall;
    }

    const t1 = t0 + ingressMs;
    const t2a = t1 + dispatchMs;
    const t2b = t1 + dispatchMs;
    const t3a = t2a + wireAMs;
    const t3b = t2b + wireBMs;
    const t4 = Math.max(t3a, t3b);

    const isMiss = Math.random() < c.missRate;

    profilerBus.push({
      serial: isMiss ? null : randomSerial(),
      outcome: isMiss ? "missed" : "printed",
      t0, t1, t2a, t2b, t3a, t3b, t4,
      ingressMs,
      dispatchMs,
      wireAMs,
      wireBMs,
      skewMs: Math.abs(t3a - t3b),
      cycleMs: t4 - t0,
    });
  }
}

export const syntheticGenerator = new SyntheticGenerator();
