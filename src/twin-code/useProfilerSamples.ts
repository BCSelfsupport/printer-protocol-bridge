import { useEffect, useState } from "react";
import { profilerBus } from "./profilerBus";
import type { BottleSample } from "./types";

/** Subscribe a component to the live ring buffer. Re-renders on rAF batch. */
export function useProfilerSamples(): BottleSample[] {
  const [samples, setSamples] = useState<BottleSample[]>(() => profilerBus.getSamples());
  useEffect(() => profilerBus.subscribe(setSamples), []);
  return samples;
}
