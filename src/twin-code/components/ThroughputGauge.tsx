import { useEffect, useState } from "react";
import { liveMetrics, type LiveMetricsSnapshot } from "../liveMetrics";
import type { BottleSample } from "../types";

interface Props {
  // Kept for API compatibility; ThroughputGauge derives BPM from the
  // authoritative liveMetrics store (60s rolling window) so a hand-triggered
  // 1.6s/bottle pace doesn't fall below the gauge's window and read 0.
  samples?: BottleSample[];
}

/** Throughput gauge — bottles/min averaged over last 60s of wall-clock time. */
export function ThroughputGauge(_props: Props) {
  const [snap, setSnap] = useState<LiveMetricsSnapshot>(() => liveMetrics.getSnapshot());

  useEffect(() => liveMetrics.subscribe(setSnap), []);

  return (
    <div className="rounded-md border border-border bg-card p-3">
      <h4 className="text-sm font-semibold text-foreground">Throughput</h4>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="font-mono text-3xl font-bold text-primary">{snap.bpm.toFixed(0)}</span>
        <span className="text-xs text-muted-foreground">bottles / min</span>
      </div>
      <p className="mt-1 text-[10px] text-muted-foreground">
        {snap.hasLiveData ? "60-second rolling average" : "waiting for first print…"}
      </p>
    </div>
  );
}
