/**
 * Twin Code — telemetry ring buffer + pub/sub.
 *
 * Single source of truth for bottle samples. All visualizations subscribe
 * here. Capped at MAX_SAMPLES to keep memory bounded; the full session is
 * also captured separately for export.
 *
 * NO IPC, NO Electron coupling at this layer — the ring buffer is transport-
 * agnostic. In Phase 1b an Electron-main capture path will batch-push samples
 * here every ~100ms; in Phase 1a a synthetic generator drives it.
 */

import type { BottleSample, ProfilerSession } from "./types";

const MAX_SAMPLES = 10_000;

type Listener = (samples: BottleSample[]) => void;

class ProfilerBus {
  private samples: BottleSample[] = [];
  private listeners = new Set<Listener>();
  private session: ProfilerSession | null = null;
  private nextIndex = 0;
  /** Coalesce notifications to the next animation frame to avoid render storms. */
  private notifyScheduled = false;

  startSession(label = "Live session"): ProfilerSession {
    this.session = {
      id: `sess-${Date.now()}`,
      startedAt: Date.now(),
      endedAt: null,
      label,
      samples: [],
    };
    this.samples = [];
    this.nextIndex = 0;
    this.scheduleNotify();
    return this.session;
  }

  endSession(): ProfilerSession | null {
    if (this.session) {
      this.session.endedAt = Date.now();
      this.session.samples = [...this.samples];
    }
    return this.session;
  }

  loadReplay(session: ProfilerSession) {
    this.session = session;
    this.samples = [...session.samples];
    this.nextIndex = this.samples.length;
    this.scheduleNotify();
  }

  push(sample: Omit<BottleSample, "index">) {
    const s: BottleSample = { ...sample, index: this.nextIndex++ };
    this.samples.push(s);
    if (this.samples.length > MAX_SAMPLES) {
      this.samples.splice(0, this.samples.length - MAX_SAMPLES);
    }
    this.scheduleNotify();
  }

  getSamples(): BottleSample[] {
    return this.samples;
  }

  getSession(): ProfilerSession | null {
    return this.session;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.samples);
    return () => this.listeners.delete(fn);
  }

  private scheduleNotify() {
    if (this.notifyScheduled) return;
    this.notifyScheduled = true;
    requestAnimationFrame(() => {
      this.notifyScheduled = false;
      const snapshot = this.samples;
      this.listeners.forEach((l) => l(snapshot));
    });
  }
}

export const profilerBus = new ProfilerBus();
