/**
 * Twin Code — tiny WebAudio beep generator for shift-floor alarms.
 *
 * No assets, no third-party deps. The AudioContext is lazily created on the
 * first user gesture (browsers block autoplay until then) and reused for every
 * subsequent beep so we don't allocate per-event.
 */

let ctx: AudioContext | null = null;

function ensureCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (ctx && ctx.state !== "closed") return ctx;
  try {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    return ctx;
  } catch {
    return null;
  }
}

export interface BeepOpts {
  /** Frequency in Hz. */
  freq?: number;
  /** Duration in ms. */
  durationMs?: number;
  /** Peak gain 0..1. */
  gain?: number;
  /** Oscillator type. */
  type?: OscillatorType;
}

export function beep(opts: BeepOpts = {}) {
  const c = ensureCtx();
  if (!c) return;
  // Some browsers leave the context "suspended" until a user gesture.
  if (c.state === "suspended") {
    c.resume().catch(() => {});
  }
  const { freq = 880, durationMs = 120, gain = 0.18, type = "square" } = opts;
  const now = c.currentTime;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  // Tiny attack/release to avoid clicks.
  g.gain.setValueAtTime(0, now);
  g.gain.linearRampToValueAtTime(gain, now + 0.005);
  g.gain.linearRampToValueAtTime(gain, now + durationMs / 1000 - 0.01);
  g.gain.linearRampToValueAtTime(0, now + durationMs / 1000);
  osc.connect(g);
  g.connect(c.destination);
  osc.start(now);
  osc.stop(now + durationMs / 1000 + 0.02);
}

/** Two-tone alarm for miss-prints — distinctive and audible across a shop floor. */
export function missAlarm() {
  beep({ freq: 660, durationMs: 110, type: "square", gain: 0.22 });
  setTimeout(() => beep({ freq: 440, durationMs: 160, type: "square", gain: 0.22 }), 120);
}

/** Soft tick on every printed serial — opt-in, off by default. */
export function printTick() {
  beep({ freq: 1200, durationMs: 25, type: "sine", gain: 0.08 });
}
