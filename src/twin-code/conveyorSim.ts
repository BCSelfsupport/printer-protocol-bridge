/**
 * Twin Code — Conveyor Simulation Engine.
 *
 * Models a photocell-triggered bonded twin printer station:
 *   - Bottles march along the conveyor at a configurable line speed.
 *   - When a bottle's centerline crosses the photocell beam, fires Print Go.
 *   - Print Go consumes one serial from the catalog (or logs a miss-print)
 *     and simulates the bonded ^FD send through both printers, capturing
 *     full T0–T4 timing into the existing profilerBus.
 *
 * Speed model (industrial, matches how the customer thinks):
 *   - Line speed in ft/min  ↔  mm/sec via 1 ft = 304.8 mm.
 *   - Pitch (mm) = distance between bottle centerlines.
 *   - bpm = (lineSpeed_mm_per_sec / pitch_mm) * 60.
 *   - Edit any one of {ftPerMin, pitchMm, bpm} → other two recompute.
 *
 * The simulator drives the SAME profilerBus + ledger that the real
 * Phase 1b/2 hot path will use. No throwaway code.
 */

import { profilerBus } from "./profilerBus";
import { catalog } from "./catalog";

export interface ConveyorConfig {
  /** Line speed in ft/min. */
  ftPerMin: number;
  /** Centerline-to-centerline pitch between bottles (mm). */
  pitchMm: number;
  /** Bottle diameter (mm) — visual + collision width. */
  bottleDiameterMm: number;
  /** Photocell beam x-position as fraction of conveyor length (0..1). */
  photocellPos: number;
  /** Mean simulated wire round-trip for printer A (ms). */
  wireAMean: number;
  /** Mean simulated wire round-trip for printer B (ms). */
  wireBMean: number;
  /** Jitter ratio (0..1). */
  jitter: number;
  /** Probability of a per-bottle firmware stall (0..1). */
  stallRate: number;
}

export const DEFAULT_CONVEYOR_CONFIG: ConveyorConfig = {
  ftPerMin: 250,
  pitchMm: 80,
  bottleDiameterMm: 60,
  photocellPos: 0.6,
  wireAMean: 8,
  wireBMean: 6,
  jitter: 0.25,
  stallRate: 0.01,
};

export interface Bottle {
  id: number;
  /** Position along conveyor (mm from left edge). */
  xMm: number;
  /** State machine for visualization. */
  state: "pending" | "printing" | "printed" | "missed" | "stale";
  /** Serial stamped onto the bottle (null = miss-print). */
  serial: string | null;
  /** Skew between A/B ACKs in ms (visualization tint). */
  skewMs: number | null;
  /** Cycle time in ms. */
  cycleMs: number | null;
  /** True once photocell has fired for this bottle (one-shot). */
  triggered: boolean;
}

export interface ConveyorSnapshot {
  bottles: Bottle[];
  conveyorLengthMm: number;
  lineSpeedMmPerSec: number;
  bpm: number;
}

type Listener = (snapshot: ConveyorSnapshot) => void;

const FT_TO_MM = 304.8;

export function ftPerMinToMmPerSec(ftPerMin: number): number {
  return (ftPerMin * FT_TO_MM) / 60;
}
export function computeBpm(ftPerMin: number, pitchMm: number): number {
  if (pitchMm <= 0) return 0;
  return (ftPerMinToMmPerSec(ftPerMin) / pitchMm) * 60;
}
export function pitchFromBpm(ftPerMin: number, bpm: number): number {
  if (bpm <= 0) return 0;
  return (ftPerMinToMmPerSec(ftPerMin) * 60) / bpm;
}
export function ftPerMinFromBpm(pitchMm: number, bpm: number): number {
  return (bpm * pitchMm * 60) / (FT_TO_MM * 60);
}

function noise(jitter: number): number {
  const u1 = Math.random() || 1e-9;
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return Math.max(0.1, 1 + z * jitter * 0.4);
}

class ConveyorSim {
  private config: ConveyorConfig = DEFAULT_CONVEYOR_CONFIG;
  /** Visible conveyor length in mm — derived from container width at render time. */
  private conveyorLengthMm = 1200;
  private bottles: Bottle[] = [];
  private nextBottleId = 0;
  private nextSpawnAtMm = 0;
  private rafId: number | null = null;
  private lastFrameMs = 0;
  private startedAtPerf = 0;
  private listeners = new Set<Listener>();
  private bottleCount = 0;

  configure(patch: Partial<ConveyorConfig>) {
    this.config = { ...this.config, ...patch };
  }
  getConfig(): ConveyorConfig { return this.config; }

  setConveyorLength(mm: number) {
    this.conveyorLengthMm = mm;
  }

  isRunning(): boolean { return this.rafId !== null; }

  start() {
    if (this.rafId !== null) return;
    this.lastFrameMs = performance.now();
    this.startedAtPerf = this.lastFrameMs;
    this.nextSpawnAtMm = 0; // first bottle enters immediately
    this.tick();
  }

  stop() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  reset() {
    this.stop();
    this.bottles = [];
    this.nextBottleId = 0;
    this.nextSpawnAtMm = 0;
    this.bottleCount = 0;
    this.notify();
  }

  /** Manually fire the photocell — useful for one-shot debugging. */
  manualFire() {
    // Find the closest bottle to the photocell beam that hasn't triggered yet
    const beamMm = this.config.photocellPos * this.conveyorLengthMm;
    let target: Bottle | null = null;
    let bestDist = Infinity;
    for (const b of this.bottles) {
      if (b.triggered) continue;
      const d = Math.abs(b.xMm - beamMm);
      if (d < bestDist) { bestDist = d; target = b; }
    }
    if (target) this.firePhotocell(target);
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.snapshot());
    return () => this.listeners.delete(fn);
  }

  private tick = () => {
    const now = performance.now();
    const dtSec = Math.min(0.1, (now - this.lastFrameMs) / 1000);
    this.lastFrameMs = now;

    const speedMmPerSec = ftPerMinToMmPerSec(this.config.ftPerMin);
    const beamMm = this.config.photocellPos * this.conveyorLengthMm;

    // Advance bottles
    for (const b of this.bottles) {
      const prevX = b.xMm;
      b.xMm += speedMmPerSec * dtSec;
      // Photocell crossing detection (centerline)
      if (!b.triggered && prevX < beamMm && b.xMm >= beamMm) {
        this.firePhotocell(b);
      }
    }

    // Spawn new bottles. The "next spawn position" is offset by pitch from the
    // last spawned bottle's entry point, so spacing is exact regardless of fps.
    while (this.nextSpawnAtMm <= 0) {
      this.bottles.push({
        id: this.nextBottleId++,
        xMm: this.nextSpawnAtMm,
        state: "pending",
        serial: null,
        skewMs: null,
        cycleMs: null,
        triggered: false,
      });
      this.nextSpawnAtMm += this.config.pitchMm;
      this.bottleCount++;
    }
    this.nextSpawnAtMm -= speedMmPerSec * dtSec;

    // Cull bottles past the right edge (with a small buffer for visualization)
    const cullX = this.conveyorLengthMm + 50;
    this.bottles = this.bottles.filter((b) => b.xMm < cullX);

    this.notify();
    this.rafId = requestAnimationFrame(this.tick);
  };

  /** Photocell triggers bonded Print Go. Times stages and pushes to profilerBus. */
  private firePhotocell(bottle: Bottle) {
    bottle.triggered = true;
    bottle.state = "printing";

    const c = this.config;
    const t0 = performance.now() - this.startedAtPerf;

    // Catalog dispense
    const serial = catalog.dispense();
    if (serial === null) {
      // Miss-print: catalog exhausted
      bottle.serial = null;
      bottle.state = "missed";
      bottle.cycleMs = 0;
      bottle.skewMs = 0;
      catalog.recordMissed(bottle.id);

      profilerBus.push({
        serial: null,
        outcome: "missed",
        t0, t1: t0, t2a: t0, t2b: t0, t3a: t0, t3b: t0, t4: t0,
        ingressMs: 0, dispatchMs: 0, wireAMs: 0, wireBMs: 0, skewMs: 0, cycleMs: 0,
      });
      return;
    }

    // Realistic latencies
    const ingressMs = 0.5 * noise(c.jitter); // catalog lookup is in-memory + cheap
    const dispatchMs = 1.5 * noise(c.jitter);
    let wireAMs = c.wireAMean * noise(c.jitter);
    let wireBMs = c.wireBMean * noise(c.jitter);
    if (Math.random() < c.stallRate) {
      const stall = 50 + Math.random() * 100;
      if (Math.random() < 0.5) wireAMs += stall; else wireBMs += stall;
    }

    const t1 = t0 + ingressMs;
    const t2a = t1 + dispatchMs;
    const t2b = t1 + dispatchMs;
    const t3a = t2a + wireAMs;
    const t3b = t2b + wireBMs;
    const t4 = Math.max(t3a, t3b);

    // Stamp the bottle now (visual), then schedule the "printed" transition
    // to land after the simulated wire round-trip so the operator can see the
    // print latency relative to bottle motion.
    bottle.serial = serial;

    const cycleMs = t4 - t0;
    const skewMs = Math.abs(t3a - t3b);
    const settleAfterMs = Math.min(cycleMs, 200); // cap visual delay

    setTimeout(() => {
      bottle.state = "printed";
      bottle.cycleMs = cycleMs;
      bottle.skewMs = skewMs;
      catalog.recordPrinted(serial, bottle.id);
    }, settleAfterMs);

    profilerBus.push({
      serial,
      outcome: "printed",
      t0, t1, t2a, t2b, t3a, t3b, t4,
      ingressMs, dispatchMs, wireAMs, wireBMs, skewMs, cycleMs,
    });
  }

  private snapshot(): ConveyorSnapshot {
    return {
      bottles: this.bottles,
      conveyorLengthMm: this.conveyorLengthMm,
      lineSpeedMmPerSec: ftPerMinToMmPerSec(this.config.ftPerMin),
      bpm: computeBpm(this.config.ftPerMin, this.config.pitchMm),
    };
  }

  private notify() {
    const snap = this.snapshot();
    this.listeners.forEach((l) => l(snap));
  }
}

export const conveyorSim = new ConveyorSim();
