/**
 * Twin Code — Fault Guard.
 *
 * Watches every bonded dispatch result and detects shift-floor faults that
 * warrant immediately stopping the conveyor before more bottles fly past
 * unprinted. Categories detected:
 *
 *   - jet-stop      : printer reports JET STOP (^MB rejected) on either side
 *   - disconnect    : transport-level send failure / timeout (e.g. cable pulled)
 *   - partner-loop  : repeated "partner-failed" cascades (one side keeps dying)
 *   - miss-streak   : N consecutive failed dispatches in a row
 *   - high-miss-rate: sustained miss-rate over a sliding window exceeds budget
 *
 * Detection is purely advisory — the guard emits a fault and the conveyor /
 * UI decide what to do (default: pause the conveyor and show the resume
 * banner). Anti-double-dispatch is enforced by the catalog ledger, so even
 * mid-fault the system cannot reissue a serial that already left.
 *
 * Why this lives in its own module:
 *   - twinDispatcher is the wire layer; it shouldn't know about UX policy.
 *   - conveyorSim is the kinetics layer; it shouldn't classify faults.
 *   - This module is the policy layer between them.
 */

import { conveyorSim } from "./conveyorSim";

export type FaultCode =
  | "jet-stop"
  | "disconnect"
  | "partner-loop"
  | "miss-streak"
  | "high-miss-rate";

export type FaultSide = "A" | "B" | "both" | "unknown";

export interface FaultEvent {
  code: FaultCode;
  side: FaultSide;
  /** Human-readable explanation for the banner. */
  message: string;
  /** Wall-clock when the guard fired. */
  at: number;
  /** Bottle index of the LAST bottle attempted before the fault. Operator can
   *  use this to confirm where production should resume. */
  lastBottleIndex: number | null;
  /** Snapshot of recent dispatch reasons that led to the trip. */
  recentReasons: string[];
}

export interface FaultGuardConfig {
  /** Trip after this many consecutive failed dispatches. */
  missStreakLimit: number;
  /** Sliding window length for miss-rate tracking (in dispatches). */
  windowSize: number;
  /** If miss-rate over the window exceeds this fraction, trip. */
  windowMissRateLimit: number;
  /** Minimum samples in window before miss-rate check is meaningful. */
  windowMinSamples: number;
  /** Trip after this many "partner-failed" cascades in a row. */
  partnerLoopLimit: number;
  /** When true, the guard automatically pauses the conveyor on any trip. */
  autoPause: boolean;
}

export const DEFAULT_FAULT_GUARD_CONFIG: FaultGuardConfig = {
  missStreakLimit: 3,
  windowSize: 20,
  windowMissRateLimit: 0.25,
  windowMinSamples: 8,
  partnerLoopLimit: 4,
  autoPause: true,
};

/** Result shape consumed by the guard (subset of TwinDispatchResult). */
export interface DispatchOutcome {
  ok: boolean;
  reason?: string;
  aReason?: string;
  bReason?: string;
  /** Bottle index of the dispatch (when known). */
  bottleIndex?: number;
}

type Listener = (state: FaultGuardSnapshot) => void;

export interface FaultGuardSnapshot {
  /** Currently-active fault, if any. Cleared on `acknowledge()`. */
  active: FaultEvent | null;
  /** Last 25 fault events (newest first) for the History panel. */
  recent: FaultEvent[];
  /** Live counters for the HUD. */
  consecutiveFailures: number;
  windowFailures: number;
  windowSamples: number;
  /** True while the conveyor was auto-paused by THIS guard. */
  autoPaused: boolean;
  /** Bottle index at the moment of the trip (so UI can show "resume from N"). */
  trippedAtBottle: number | null;
}

const HISTORY_LIMIT = 25;

class FaultGuard {
  private cfg: FaultGuardConfig = DEFAULT_FAULT_GUARD_CONFIG;
  private listeners = new Set<Listener>();
  private window: boolean[] = []; // true = ok, false = failed
  private consecutiveFailures = 0;
  private partnerLoopCount = 0;
  private active: FaultEvent | null = null;
  private recent: FaultEvent[] = [];
  private autoPaused = false;
  private trippedAtBottle: number | null = null;
  /** Increasing count of bottles seen — used as a fallback when bottleIndex
   *  is omitted from a dispatch outcome. */
  private bottleSeq = 0;

  configure(patch: Partial<FaultGuardConfig>) {
    this.cfg = { ...this.cfg, ...patch };
  }
  getConfig(): FaultGuardConfig { return this.cfg; }

  /** Wire one bonded dispatch result through the guard. */
  observeDispatch(out: DispatchOutcome) {
    this.bottleSeq++;
    const bottle = out.bottleIndex ?? this.bottleSeq;

    // Slide the window
    this.window.push(out.ok);
    if (this.window.length > this.cfg.windowSize) this.window.shift();

    if (out.ok) {
      this.consecutiveFailures = 0;
      this.partnerLoopCount = 0;
      this.notify();
      return;
    }

    this.consecutiveFailures++;
    const reason = (out.reason || "").toLowerCase();
    const aR = (out.aReason || "").toLowerCase();
    const bR = (out.bReason || "").toLowerCase();
    const allReasons = [out.aReason, out.bReason, out.reason].filter(Boolean) as string[];

    // 1. JET STOP — direct hit
    if (/jet|jnr|jet not running|jet stop/.test(reason + " " + aR + " " + bR)) {
      this.trip({
        code: "jet-stop",
        side: this.sideFromReasons(aR, bR),
        message: "Printer JET STOP — restart the jet, then resume the run.",
        at: Date.now(),
        lastBottleIndex: bottle,
        recentReasons: allReasons,
      });
      return;
    }

    // 2. Transport / disconnect-style failures
    if (/timeout|send-failed|not-active|detached|socket|econnreset|enotconn|ehostunreach/.test(reason + " " + aR + " " + bR)) {
      this.trip({
        code: "disconnect",
        side: this.sideFromReasons(aR, bR),
        message: "Lost printer link — check network/power, then resume.",
        at: Date.now(),
        lastBottleIndex: bottle,
        recentReasons: allReasons,
      });
      return;
    }

    // 3. Partner-loop cascade — one side keeps dragging the other down
    if (/partner-failed/.test(aR + " " + bR + " " + reason)) {
      this.partnerLoopCount++;
      if (this.partnerLoopCount >= this.cfg.partnerLoopLimit) {
        this.trip({
          code: "partner-loop",
          side: this.sideFromReasons(aR, bR),
          message: "One side keeps failing first — the partner is being aborted repeatedly. Investigate the failing printer.",
          at: Date.now(),
          lastBottleIndex: bottle,
          recentReasons: allReasons,
        });
        return;
      }
    } else {
      this.partnerLoopCount = 0;
    }

    // 4. Consecutive miss streak
    if (this.consecutiveFailures >= this.cfg.missStreakLimit) {
      this.trip({
        code: "miss-streak",
        side: this.sideFromReasons(aR, bR),
        message: `${this.consecutiveFailures} consecutive miss-prints — line auto-paused for inspection.`,
        at: Date.now(),
        lastBottleIndex: bottle,
        recentReasons: allReasons,
      });
      return;
    }

    // 5. Sliding-window miss rate
    if (this.window.length >= this.cfg.windowMinSamples) {
      const failed = this.window.filter((ok) => !ok).length;
      const rate = failed / this.window.length;
      if (rate >= this.cfg.windowMissRateLimit) {
        this.trip({
          code: "high-miss-rate",
          side: "unknown",
          message: `Miss-rate ${(rate * 100).toFixed(0)}% over last ${this.window.length} bottles — line auto-paused.`,
          at: Date.now(),
          lastBottleIndex: bottle,
          recentReasons: allReasons,
        });
        return;
      }
    }

    this.notify();
  }

  /** Manually trip the guard (e.g. printer-side fault stream observed by Electron). */
  trip(ev: FaultEvent) {
    // De-duplicate: same code within last 1.5s collapses into the existing one.
    if (this.active && this.active.code === ev.code && ev.at - this.active.at < 1500) {
      this.notify();
      return;
    }
    this.active = ev;
    this.recent = [ev, ...this.recent].slice(0, HISTORY_LIMIT);
    this.trippedAtBottle = ev.lastBottleIndex;
    if (this.cfg.autoPause && conveyorSim.isRunning()) {
      conveyorSim.stop();
      this.autoPaused = true;
    }
    this.notify();
  }

  /** Operator clicks "Resume" — clear the active fault. Does NOT restart the
   *  conveyor; the conveyor controls do that explicitly. */
  acknowledge() {
    this.active = null;
    this.consecutiveFailures = 0;
    this.partnerLoopCount = 0;
    this.window = [];
    this.autoPaused = false;
    this.trippedAtBottle = null;
    this.notify();
  }

  /** Reset all state — used when a new run starts. */
  reset() {
    this.window = [];
    this.consecutiveFailures = 0;
    this.partnerLoopCount = 0;
    this.active = null;
    this.recent = [];
    this.autoPaused = false;
    this.trippedAtBottle = null;
    this.bottleSeq = 0;
    this.notify();
  }

  /** Snapshot for React subscribers. */
  getSnapshot(): FaultGuardSnapshot {
    return {
      active: this.active,
      recent: this.recent,
      consecutiveFailures: this.consecutiveFailures,
      windowFailures: this.window.filter((ok) => !ok).length,
      windowSamples: this.window.length,
      autoPaused: this.autoPaused,
      trippedAtBottle: this.trippedAtBottle,
    };
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.getSnapshot());
    return () => { this.listeners.delete(fn); };
  }

  private sideFromReasons(aR: string, bR: string): FaultSide {
    if (aR && bR) return "both";
    if (aR) return "A";
    if (bR) return "B";
    return "unknown";
  }

  private notify() {
    const snap = this.getSnapshot();
    this.listeners.forEach((l) => l(snap));
  }
}

export const faultGuard = new FaultGuard();
