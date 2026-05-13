import { useEffect, useState } from "react";
import { profilerBus } from "./profilerBus";
import type { BottleSample } from "./types";

/**
 * Subscribe a component to the live ring buffer.
 *
 * `profilerBus.scheduleNotify` notifies subscribers with the *same* internal
 * array reference on every push (it mutates in-place via `samples.push`).
 * React's `setState` bails on referential equality, so without copying the
 * snapshot the OperatorHUD's "Last printed" readout would freeze on whatever
 * sample was present at the moment we first subscribed (e.g. "awaiting first
 * print…" forever in native photocell mode). A shallow copy per notify is
 * cheap (typical buffer size <1k) and guarantees re-render on every push.
 */
export function useProfilerSamples(): BottleSample[] {
  const [samples, setSamples] = useState<BottleSample[]>(() => [...profilerBus.getSamples()]);
  useEffect(() => profilerBus.subscribe((s) => setSamples([...s])), []);
  return samples;
}
