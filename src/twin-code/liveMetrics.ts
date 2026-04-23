/**
 * Twin Code — Live Production Metrics
 * ------------------------------------
 * Authoritative source for real-world production metrics on a bonded twin
 * line. UNLIKE the synthetic generator sliders (which drive the simulator),
 * THIS module derives BPM and line speed from the actual ^MD dispatch
 * timestamps the dispatcher pushes into `profilerBus`.
 *
 * Why a separate store from `conveyorSim`?
 *   - `conveyorSim` is the visualizer/test harness — its `bpm` and
 *     `lineSpeedMmPerSec` reflect the SIMULATED conveyor, not real prints.
 *   - `liveMetrics` reflects what the printer line is actually doing right
 *     now: each successful dispatch (outcome === "printed") is one bottle.
 *
 * Math
 *   - BPM (rolling) = count of `printed` samples in last `WINDOW_MS`,
 *     normalized to /minute. We use a trailing 60s window so brief stalls
 *     don't zero the gauge instantly but the operator still sees real
 *     changes within ~10s.
 *   - Line speed (mm/s) = BPM × pitchMm / 60.
 *   - Gap (mm) = max(0, pitchMm − bottleDiameterMm).
 *
 * Persistence
 *   - `pitchMm` and `bottleDiameterMm` are saved to localStorage so each
 *     PC remembers the line's mechanical setup across reloads.
 */

import { profilerBus } from "./profilerBus";
import type { BottleSample } from "./types";

const STORAGE_KEY = "twincode.liveMetrics.v1";
const WINDOW_MS = 60_000;
/** Coalesce notify() to next animation frame so subscribers don't render-storm. */
const ANIMATION_FRAME = typeof requestAnimationFrame !== "undefined"
  ? requestAnimationFrame
  : (cb: () => void) => setTimeout(cb, 16);

export interface LiveMetricsConfig {
  /** Bottle pitch (center-to-center spacing) in millimetres. */
  pitchMm: number;
  /** Bottle diameter in millimetres. Used to compute gap = pitch − Ø. */
  bottleDiameterMm: number;
}

export interface LiveMetricsSnapshot extends LiveMetricsConfig {
  /** Bottles per minute, computed from real dispatches in the last 60s. */
  bpm: number;
  /** Line speed in mm/sec derived from bpm × pitch. */
  lineSpeedMmPerSec: number;
  /** Gap between bottles in mm (pitch − Ø, clamped at 0). */
  gapMm: number;
  /** Total dispatches we've observed since the metrics store woke up. */
  totalSeen: number;
  /** Wall-clock epoch ms of the most recent printed dispatch (or null). */
  lastPrintedAt: number | null;
  /** True when at least one printed sample exists in the rolling window. */
  hasLiveData: boolean;
}

const DEFAULT_CONFIG: LiveMetricsConfig = {
  pitchMm: 80,
  bottleDiameterMm: 60,
};

type Listener = (snap: LiveMetricsSnapshot) => void;

class LiveMetricsStore {
  private config: LiveMetricsConfig = { ...DEFAULT_CONFIG };
  /** Wall-clock epoch ms of every printed dispatch, capped to last WINDOW_MS. */
  private printedTimestamps: number[] = [];
  private totalSeen = 0;
  private lastSeenIndex = -1;
  private listeners = new Set<Listener>();
  private notifyScheduled = false;
  private tickHandle: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.restore();
    // Subscribe once to the profiler bus — every push (printed OR missed) is
    // checked against `lastSeenIndex` so we count each bottle exactly once.
    profilerBus.subscribe((samples) => this.ingest(samples));
    // Tick the rolling window every 1s so the gauge decays naturally even
    // when no new dispatches arrive (e.g. line stopped).
    this.tickHandle = setInterval(() => this.scheduleNotify(), 1000);
  }

  getSnapshot(): LiveMetricsSnapshot {
    const now = Date.now();
    const cutoff = now - WINDOW_MS;
    // Drop expired timestamps from the head.
    while (this.printedTimestamps.length > 0 && this.printedTimestamps[0] < cutoff) {
      this.printedTimestamps.shift();
    }
    const inWindow = this.printedTimestamps.length;
    // BPM scaled to /min over the actual elapsed window (not always 60s when
    // the store just started). This avoids artificially low BPM in the first
    // minute of running.
    const oldest = this.printedTimestamps[0] ?? now;
    const elapsedMs = Math.max(1, now - oldest);
    const effectiveWindow = Math.min(WINDOW_MS, Math.max(elapsedMs, 5_000));
    const bpm = inWindow === 0 ? 0 : (inWindow / effectiveWindow) * 60_000;

    const lineSpeedMmPerSec = (bpm * this.config.pitchMm) / 60;
    const gapMm = Math.max(0, this.config.pitchMm - this.config.bottleDiameterMm);
    const lastPrintedAt = this.printedTimestamps.length > 0
      ? this.printedTimestamps[this.printedTimestamps.length - 1]
      : null;

    return {
      ...this.config,
      bpm,
      lineSpeedMmPerSec,
      gapMm,
      totalSeen: this.totalSeen,
      lastPrintedAt,
      hasLiveData: inWindow > 0,
    };
  }

  setConfig(patch: Partial<LiveMetricsConfig>) {
    const next = { ...this.config, ...patch };
    // Clamp to sensible mechanical bounds — these aren't security limits, just
    // sanity (a pitch of 0 would zero the line speed and confuse operators).
    next.pitchMm = clamp(next.pitchMm, 1, 1000);
    next.bottleDiameterMm = clamp(next.bottleDiameterMm, 1, 1000);
    this.config = next;
    this.persist();
    this.scheduleNotify();
  }

  /** Reset the rolling window — useful when a new run starts. */
  resetWindow() {
    this.printedTimestamps = [];
    this.totalSeen = 0;
    this.scheduleNotify();
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.getSnapshot());
    return () => { this.listeners.delete(fn); };
  }

  // ---- internals ----

  private ingest(samples: BottleSample[]) {
    if (samples.length === 0) {
      // Session reset — drop any state from the prior session.
      if (this.lastSeenIndex !== -1) {
        this.lastSeenIndex = -1;
        this.printedTimestamps = [];
        this.totalSeen = 0;
        this.scheduleNotify();
      }
      return;
    }
    const lastIdx = samples[samples.length - 1].index;
    if (lastIdx <= this.lastSeenIndex) return;
    const now = Date.now();
    // Walk from the first new sample to the end.
    for (const s of samples) {
      if (s.index <= this.lastSeenIndex) continue;
      this.totalSeen++;
      if (s.outcome === "printed") {
        // BottleSample doesn't carry a wall-clock timestamp, so we use Date.now()
        // at ingest time. Profiler bus notifies are coalesced to the next
        // animation frame, so we may bucket several dispatches into the same
        // tick — that's accurate enough for a rolling 60s gauge.
        this.printedTimestamps.push(now);
      }
    }
    this.lastSeenIndex = lastIdx;
    this.scheduleNotify();
  }

  private scheduleNotify() {
    if (this.notifyScheduled) return;
    this.notifyScheduled = true;
    ANIMATION_FRAME(() => {
      this.notifyScheduled = false;
      const snap = this.getSnapshot();
      this.listeners.forEach((l) => l(snap));
    });
  }

  private persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.config));
    } catch { /* ignore quota / private mode */ }
  }

  private restore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<LiveMetricsConfig>;
      this.config = {
        pitchMm: typeof parsed.pitchMm === "number" ? parsed.pitchMm : DEFAULT_CONFIG.pitchMm,
        bottleDiameterMm: typeof parsed.bottleDiameterMm === "number"
          ? parsed.bottleDiameterMm
          : DEFAULT_CONFIG.bottleDiameterMm,
      };
    } catch { /* ignore */ }
  }
}

function clamp(n: number, lo: number, hi: number): number {
  if (Number.isNaN(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}

export const liveMetrics = new LiveMetricsStore();
